const crypto = require("crypto");
const path = require("path");
const express = require("express");
const {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

const app = express();
const port = Number(process.env.PORT || 3000);
const bucket = process.env.S3_BUCKET_NAME;
const adminToken = process.env.COMMENTS_ADMIN_TOKEN || "";
const keyPrefix = `${(process.env.S3_KEY_PREFIX || "").replace(/\/+$/, "")}/comments/`.replace(/^\//, "");
const allowedOrigins = new Set(
  (process.env.COMMENTS_ALLOWED_ORIGINS ||
    "https://www.stopwastingtimewithai.com,https://stopwastingtimewithai.com,https://swtwai-website.dailey.cloud")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const storageConfigured = Boolean(
  bucket &&
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY,
);

const s3 = storageConfigured
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        ...(process.env.S3_SESSION_TOKEN
          ? { sessionToken: process.env.S3_SESSION_TOKEN }
          : {}),
      },
    })
  : null;

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "24kb" }));

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const rateLimits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const recent = (rateLimits.get(ip) || []).filter((time) => now - time < windowMs);
  if (recent.length >= 3) return true;
  recent.push(now);
  rateLimits.set(ip, recent);
  return false;
}

function cleanSingleLine(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanComment(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, 2000);
}

function validSlug(value) {
  return /^[a-z0-9][a-z0-9-]{2,159}$/.test(value);
}

function objectKey(status, articleId, id) {
  return `${keyPrefix}${status}/${articleId}/${id}.json`;
}

async function bodyToString(body) {
  if (!body) return "";
  if (typeof body.transformToString === "function") return body.transformToString();
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readComment(key) {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return JSON.parse(await bodyToString(result.Body));
}

async function writeComment(key, comment) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(comment),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store",
    }),
  );
}

async function listCommentKeys(prefix, limit = 200) {
  const keys = [];
  let continuationToken;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: Math.min(1000, limit - keys.length),
      }),
    );
    keys.push(...(page.Contents || []).map((item) => item.Key).filter(Boolean));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken && keys.length < limit);
  return keys.slice(0, limit);
}

async function readComments(keys) {
  const comments = [];
  for (let i = 0; i < keys.length; i += 20) {
    const batch = await Promise.all(keys.slice(i, i + 20).map((key) => readComment(key)));
    comments.push(...batch);
  }
  return comments;
}

function requireStorage(req, res, next) {
  if (!storageConfigured) {
    return res.status(503).json({ error: "Comment storage is not configured yet." });
  }
  next();
}

function requireAdmin(req, res, next) {
  const supplied = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = Buffer.from(adminToken);
  const received = Buffer.from(supplied);
  if (!adminToken || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: "Invalid moderation access key." });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, comments: storageConfigured && Boolean(adminToken) });
});

app.get("/api/comments", requireStorage, async (req, res, next) => {
  try {
    const articleId = cleanSingleLine(req.query.articleId, 160);
    if (!validSlug(articleId)) return res.status(400).json({ error: "Invalid article." });
    const keys = await listCommentKeys(`${keyPrefix}approved/${articleId}/`, 500);
    const comments = (await readComments(keys))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(({ id, name, body, createdAt }) => ({ id, name, body, createdAt }));
    res.set("Cache-Control", "no-store").json({ comments });
  } catch (error) {
    next(error);
  }
});

app.post("/api/comments", requireStorage, async (req, res, next) => {
  try {
    if (req.body.website) return res.status(202).json({ message: "Thank you. Your comment is awaiting review." });
    if (rateLimited(req.ip || "unknown")) {
      return res.status(429).json({ error: "Please wait before submitting another comment." });
    }

    const articleId = cleanSingleLine(req.body.articleId, 160);
    const articleTitle = cleanSingleLine(req.body.articleTitle, 200);
    const name = cleanSingleLine(req.body.name, 60);
    const body = cleanComment(req.body.body);
    if (!validSlug(articleId)) return res.status(400).json({ error: "Invalid article." });
    if (name.length < 2) return res.status(400).json({ error: "Please enter your display name." });
    if (body.length < 3) return res.status(400).json({ error: "Please enter a comment." });

    const id = crypto.randomUUID();
    const comment = {
      id,
      articleId,
      articleTitle,
      name,
      body,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    await writeComment(objectKey("pending", articleId, id), comment);
    res.status(202).json({ message: "Thank you. Your comment is awaiting review." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/comments", requireStorage, requireAdmin, async (req, res, next) => {
  try {
    const status = req.query.status === "approved" ? "approved" : "pending";
    const keys = await listCommentKeys(`${keyPrefix}${status}/`, 500);
    const comments = (await readComments(keys)).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
    res.set("Cache-Control", "no-store").json({ comments });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/admin/comments/:articleId/:id/approve",
  requireStorage,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { articleId, id } = req.params;
      if (!validSlug(articleId) || !/^[0-9a-f-]{36}$/.test(id)) {
        return res.status(400).json({ error: "Invalid comment." });
      }
      const pendingKey = objectKey("pending", articleId, id);
      const comment = await readComment(pendingKey);
      const approved = { ...comment, status: "approved", approvedAt: new Date().toISOString() };
      await writeComment(objectKey("approved", articleId, id), approved);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: pendingKey }));
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

app.delete(
  "/api/admin/comments/:articleId/:id",
  requireStorage,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { articleId, id } = req.params;
      if (!validSlug(articleId) || !/^[0-9a-f-]{36}$/.test(id)) {
        return res.status(400).json({ error: "Invalid comment." });
      }
      const status = req.query.status === "approved" ? "approved" : "pending";
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(status, articleId, id) }),
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

app.use((req, res, next) => {
  if (/^\/(?:server\.js|package(?:-lock)?\.json|README\.md|\.git|node_modules)(?:\/|$)/i.test(req.path)) {
    return res.sendStatus(404);
  }
  next();
});

app.use(express.static(path.join(__dirname), { extensions: ["html"], dotfiles: "ignore" }));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "The comment service is temporarily unavailable." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`SWTWAI website listening on port ${port}`);
});
