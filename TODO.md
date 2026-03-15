# arr-barr-site TODO

## Launch Checklist
- [ ] Push site code to GitHub to trigger first real deploy
- [ ] Verify site loads at `https://arrbarr.com`
- [ ] Revoke `arr-barr-cloudflare` API token
- [ ] Deal with typo domain `arrbrr.com` (cancel/refund if possible)

## Home Page Polish
- [ ] Add OG/Twitter meta tags (image, title, description) for link previews
- [ ] Add favicon link tags in Base layout (`<link rel="icon">`)
- [ ] Hero side SVG ornaments are duplicated inline — extract to a component
- [ ] Compass loads invisible (`opacity: 0`) then GSAP fades in — add `noscript` fallback
- [ ] Terminal typing speed feels slow on revisit — add skip/fast-forward on click
- [ ] Terminal: no pause between scenes looping — add visible "scene done" indicator
- [ ] Flow diagram app icons load from external GitHub URLs — self-host or cache
- [ ] Flow diagram: `.app-grid` 6-col layout breaks awkwardly between 480–768px
- [ ] Security section uses emoji checkmarks — consider SVG icons for consistency
- [ ] CTA "Everything you need is in the repo" — link to the actual GitHub repo
- [ ] Add scroll-to-top button or smooth anchor nav
- [ ] Hero wave SVG animation (`waveDrift`) uses 200% width hack — test on ultrawide
- [ ] `.fl` elements start `opacity:0; transform:translateY(30px)` — broken without JS

## Navigation & Layout
- [ ] Mobile hamburger menu doesn't close when a link is clicked
- [ ] Nav has no GitHub/repo link
- [ ] No 404 page
- [ ] Footer says "Pandai Technologies" — link it or add a GitHub icon
- [ ] Footer has no nav links (Home, Guide, etc.)
- [ ] Base layout loads 3 Google Fonts weights — audit which are actually used
- [ ] `Cinzel Decorative` only used in compass SVG — consider self-hosting or lazy loading

## Guide Page (`/guide`)
- [ ] Currently just a placeholder — needs full content
- [ ] Sections needed: prerequisites, clone repo, configure `.env`, start stack, first request
- [ ] Add copy-to-clipboard for terminal commands
- [ ] Step-by-step numbered walkthrough with progress indicator
- [ ] Link to relevant docs sections when they exist
- [ ] Troubleshooting FAQ at the bottom

## Architecture Page (`/architecture`)
- [ ] Currently just a placeholder — needs full content
- [ ] Interactive network topology diagram (containers, ports, VPN routing)
- [ ] Hardlink path diagram (single mount → library structure)
- [ ] Service dependency graph (what talks to what)
- [ ] Docker Compose profile breakdown (media, books, games, etc.)
- [ ] Quality pipeline explainer (custom formats → scoring → selection)

## Crew Page (`/crew`) — Not Started
- [ ] Create `/crew` page
- [ ] Visual roster of all 15+ services with icons, roles, one-liner descriptions
- [ ] Group by function: request → search → download → organize → serve
- [ ] Each card links to the service's docs or relevant guide section
- [ ] Add to nav

## Costs Page (`/costs`) — Done
- [x] Three-tier pricing: Torrents Only (~$5), Torrents+Usenet (~$15), Full Spread (~$25)
- [x] Hardware options, optional add-ons, bottom line summary
- [x] No streaming service comparison (we're not selling anything)
- [x] All example media names are fictional

## Docs Section (`/docs`) — Not Started
- [ ] Create `/docs` landing page with topic index
- [ ] CLI reference (all `arr` commands)
- [ ] Quality scoring deep dive (TRaSH + Davo custom formats)
- [ ] Hardlink architecture explainer
- [ ] Network topology & VPN routing
- [ ] Backup & restore procedures
- [ ] Add to nav

## Styles & Design
- [ ] Tons of inline `style` attrs on pages — move to component/scoped styles
- [ ] Color tokens exist but many components use raw `rgba()` values instead
- [ ] No dark/light toggle (fine for now, but note for later)
- [ ] Scrollbar styles are webkit-only — add Firefox `scrollbar-color`
- [ ] No focus/keyboard styles on interactive elements (accessibility)
- [ ] Buttons have no `:focus-visible` outline
- [ ] Flow diagram layer cards have no `aria-label` or semantic structure

## Performance & SEO
- [ ] No `sitemap.xml` — add `@astrojs/sitemap` integration
- [ ] No `robots.txt`
- [ ] GSAP is a big dependency — check if tree-shaking is working (only ScrollTrigger needed)
- [ ] External font request blocks render — consider `font-display: swap` or self-hosting
- [ ] No image optimization — add `@astrojs/image` or `astro:assets` for any future images
- [ ] Lighthouse audit once deployed

## GitHub & CI
- [ ] `.github/` has a workflow but deploy target is Cloudflare Pages now — verify/update
- [ ] Add branch preview deploys via Cloudflare Pages
- [ ] README for the repo (setup, dev, deploy instructions)

## Future Ideas
- [ ] Blog/changelog section for arr-barr updates
- [ ] Live status page pulling from Athena health checks
- [ ] Friend invite flow — generate a quick-start link
- [ ] Search across all docs pages
- [ ] Animated service cards that flip to show config details
