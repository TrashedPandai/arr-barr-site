# arr-barr-site Pages

## Home `/`
The hook. Flow diagram, terminal, compass. **Built — needs polish.**

## The Guide `/guide`
Step-by-step setup from clone to streaming. The one page a new user needs. **Stub.**

## The Crew `/crew`
Visual roster of all 15 services for the curious non-techy. **Stub.**

## Costs `/costs`
What's free, what's paid, what's optional. Diagrams showing the tiers. **Not started.**

## Docs `/docs`
Technical catch-all: architecture, CLI reference, quality scoring, hardlinks, network topology. **Not started.**

---

## Launch Infrastructure

- [x] Register domain `arrbarr.com` (Cloudflare Registrar)
- [x] Set up Cloudflare Pages project (connected to `TrashedPandai/arr-barr-site`, branch: `main`)
- [x] Configure DNS: `arrbarr.com` and `www.arrbarr.com` → `arr-barr-site.pages.dev`
- [x] SSL certificate provisioning (auto, Google CA)
- [ ] Update `astro.config.mjs`: `site` → `https://arrbarr.com`, `base` → `/`
- [ ] Push site code to GitHub to trigger first real deploy
- [ ] Verify site loads at `https://arrbarr.com`
- [ ] Revoke `arr-barr-cloudflare` API token
- [ ] Deal with typo domain `arrbrr.com` (cancel/refund if possible)
