# arr-barr-site TODO

## Launch Checklist
- [ ] Push site code to GitHub to trigger first real deploy
- [ ] Verify site loads at `https://arrbarr.com`
- [ ] Revoke `arr-barr-cloudflare` API token
- [ ] Deal with typo domain `arrbrr.com` (cancel/refund if possible)

## Home Page Polish
- [x] Add OG/Twitter meta tags (image, title, description) for link previews
- [x] Add favicon link tags in Base layout
- [x] Add alt text + dimensions to all crew logo images
- [x] Terminal click-to-skip for fast-forward
- [x] Terminal ARIA attributes for screen readers
- [x] Group-tag contrast bumped to WCAG AA
- [x] Beach shore responsive height (clamp instead of fixed 300px)
- [x] No-JS fallback for scroll-animated elements
- [x] Reduced-motion handling for Lenis smooth scroll
- [x] Self-hosted all crew service icons locally (`/icons/`)
- [ ] Hero side SVG ornaments are duplicated inline — extract to a component
- [ ] Hero wave SVG animation (`waveDrift`) uses 200% width hack — test on ultrawide

## Navigation & Layout
- [x] Mobile hamburger menu closes when a link is clicked
- [x] Nav has GitHub/repo link + clone button
- [x] Custom 404 page
- [x] Footer links to GitHub repo
- [x] Footer has nav links (Home, Guide, Crew, Costs, Docs)
- [x] Removed unused Cinzel + Cinzel Decorative fonts (not referenced anywhere)

## Guide Page (`/guide`) — Done
- [x] Full content with 8 steps (prerequisites -> invite friends)
- [x] Step-by-step numbered walkthrough with progress indicator
- [x] Copy-to-clipboard for terminal commands
- [x] Troubleshooting FAQ at the bottom
- [x] Links to relevant docs sections

## Crew Page (`/crew`) — Done
- [x] Visual roster of all 15 services with icons, roles, one-liner descriptions
- [x] Grouped by function (request -> search -> download -> organize -> stream)
- [x] Each card links to service's repo/site
- [x] In nav

## Costs Page (`/costs`) — Done
- [x] Three-tier pricing with usenet deep dive
- [x] Hardware options, optional add-ons, bottom line summary
- [x] All example media names are fictional

## Docs Section (`/docs`) — Done
- [x] Full docs page with overview, topology, hardlinks, profiles, pipelines
- [x] CLI reference section
- [x] Quality scoring deep dive
- [x] Network topology & VPN routing
- [x] Architecture diagrams page (`/docs/diagrams`) with 20+ SVG diagrams
- [x] In nav
- [ ] Backup & restore procedures section

## Styles & Design
- [x] Scrollbar styles — Firefox `scrollbar-color` added
- [x] `:focus-visible` outlines on all interactive elements
- [x] JSON-LD structured data (Organization, WebSite)
- [x] Canonical URL tags
- [x] Terminal component uses CSS tokens instead of hardcoded hex
- [ ] No dark/light toggle (fine for now, but note for later)

## Performance & SEO
- [x] `sitemap.xml` via `@astrojs/sitemap`
- [x] `robots.txt`
- [ ] GSAP is a big dependency — check if tree-shaking is working
- [ ] Lighthouse audit once deployed
- [ ] No image optimization — add `astro:assets` for any future images

## Code Quality
- [x] Shared scroll-reveal utility (`src/scripts/scroll-reveal.ts`) — used by crew, costs, guide
- [ ] `.github/` workflow — verify deploy target matches current setup

## Future Ideas
- [ ] Blog/changelog section for arr-barr updates
- [ ] Live status page pulling from Athena health checks
- [ ] Friend invite flow — generate a quick-start link
- [ ] Search across all docs pages
- [ ] OG image (design a share card for social previews)
