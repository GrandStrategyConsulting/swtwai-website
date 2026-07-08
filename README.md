# Stop Wasting Time With AI — Website & Ecosystem

The web home of *Stop Wasting Time With AI* by Zena Collins — the public marketing site for the book and the surrounding ecosystem (speaking, learning products, schools, and enterprise).

Part of **Grand Strategy Consulting LLC** · [grandstrategy.llc](https://www.grandstrategy.llc)

---

## What's in this repo

```
swtwai-website/
├── index.html                          ← the website (all 7 pages, single file)
└── brand-assets/
    └── Zena_Collins_Speaker_One_Sheet.pdf
```

> Internal working files — the Ecosystem Master Brief, editable page copy, and the Cowork campaign playbooks — are kept privately and are **not** part of this public repo.

## The website

`index.html` is the entire site — seven pages (Home, The Book, Assess Your EI, Learn, Speaking, For Schools, For Teams) in one self-contained file. Images (author photo, book cover) are embedded, so nothing else is needed to display it. Navigation is client-side; no build step, no dependencies.

### To view it
Open `index.html` in any browser.

### To publish it
It's already named `index.html`, so it deploys as-is:
- **GitHub Pages:** repo Settings → Pages → deploy from the main branch. Live at a github.io URL in a minute; add the custom domain there.
- **Cloudflare Pages / Netlify:** connect this repo (or drag the file in), point stopwastingtimewithai.com at it. Free SSL.

## Still to do before the live launch
- [ ] Swap in the **full-resolution book cover** (current embed is a low-res preview).
- [ ] Wire the **email capture** and **booking form** to a real service (Tally / Formspree).
- [ ] Add **Stripe payment links** to the buy / product buttons.
- [ ] Add the **audiobook (Audible) link** when live.
- [ ] Consider a **geo-smart Amazon link** (US visitors → amazon.com).

## House style (see the Master Brief for the full spec)
- **US spellings** (theater, color, organization).
- **Trademarks exactly as registered:** Emotional Maths® is never "Emotional Math." SUMMS™, SCRIPT™.
- **SUMMS™** is the public-facing model; the **MSCEIT®2** four branches appear by name only where the assessment itself is described.
- Governance on all outreach: **drafts only — Zena sends.**

## Note on confidential materials
This repo is for the public marketing site only. Campaign playbooks and working briefs are kept privately. **No client assessment data, MSCEIT®2 results, or personal debrief materials belong here** — those require the secure, authenticated handling described in the Master Brief.

---

© Grand Strategy Consulting LLC. Emotional Maths®, SUMMS™, SCRIPT™, and the Six Dimensions of Healthy Workplace Culture are proprietary to Grand Strategy Consulting LLC. MSCEIT®2 is published by MHS.
