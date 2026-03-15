<div align="center">

# arrbarr.com

The official website for **[arr-barr](https://github.com/TrashedPandai/arr-barr)** — a self-hosted media automation stack.

[🌐 Live Site](https://arrbarr.com) · [arr-barr Stack](https://github.com/TrashedPandai/arr-barr) · [Docs](https://arrbarr.com/docs)

</div>

---

## What's Here

The website at [arrbarr.com](https://arrbarr.com) is the friendly face of the arr-barr project. It's designed for non-technical users who want to understand what the stack does, how it works, and how to get started — without reading a single line of YAML.

| Page | What It Covers |
|---|---|
| **[Home](https://arrbarr.com)** | Animated terminal demo, pipeline flow diagram, security overview |
| **[The Guide](https://arrbarr.com/guide)** | Step-by-step setup from zero to streaming |
| **[The Crew](https://arrbarr.com/crew)** | Visual roster of all 15 services grouped by role |
| **[Costs](https://arrbarr.com/costs)** | Pricing tiers, streaming comparison ($92/mo vs $17/mo), hardware options |
| **[Docs](https://arrbarr.com/docs)** | Interactive technical reference — network topology, quality scoring, CLI, troubleshooting |

## Stack

- **[Astro](https://astro.build)** v6 — static site generator
- **[GSAP](https://gsap.com)** — scroll-triggered animations, SVG drawing, animated terminal
- **[Cloudflare Pages](https://pages.cloudflare.com)** — hosting and CDN
- **Catppuccin Mocha** — dark theme color palette (matches the CLI)

## Development

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build

# Preview build
npm run preview
```

## Design

The site uses the same visual language as the arr-barr CLI:

- **Dark theme** with the Catppuccin Mocha palette
- **Color-coded service groups** (green for network, yellow for indexers, blue for media, etc.)
- **Nautical metaphors** — the crew, the barr, the vault, the taproom
- **Gold accent** for primary CTAs
- **GSAP animations** — scroll reveals, animated flow diagrams, interactive pipeline

## Deployment

Pushes to `main` auto-deploy via Cloudflare Pages. DNS is configured on Cloudflare with `arrbarr.com` and `www.arrbarr.com` pointing to the Pages project.

## Related

- **[arr-barr](https://github.com/TrashedPandai/arr-barr)** — The actual stack (Docker Compose, CLI, configs)
- **[arrbarr.com](https://arrbarr.com)** — This site, live

---

<div align="center">

**Pandai Technologies** · *Every crew needs a port.*

</div>
