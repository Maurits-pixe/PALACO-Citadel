# PALACO Citadel

First executable PALACO UI foundation.

## What is included

- Responsive website UI for desktop, tablet, and mobile.
- Multilingual interface (English, Dutch, Esperanto).
- Basic interactive "GO" flow (save and show latest objective).
- MA5TER Dashboard Control Room for PALACO Industry and PALACO internal control modes.
- Progressive Web App baseline (manifest + service worker + install prompt support).
- GitHub Pages deployment workflow with custom domain support.

## Run locally

From `/home/runner/work/PALACO-Citadel/PALACO-Citadel`:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Domain + GitHub account linking (STRATO)

### 1) GitHub repository settings

1. Open this repository on GitHub.
2. Go to **Settings → Pages**.
3. Source: **GitHub Actions**.
4. Confirm the custom domain is `hoofdkantoor.info`.
5. Enable **Enforce HTTPS** after DNS is valid.

### 2) STRATO DNS for primary domain (`hoofdkantoor.info`)

Set these records in STRATO DNS:

- `A` record `@` → `185.199.108.153`
- `A` record `@` → `185.199.109.153`
- `A` record `@` → `185.199.110.153`
- `A` record `@` → `185.199.111.153`
- `CNAME` record `www` → `maurits-pixe.github.io`

### 3) Other STRATO domains you own

For each extra domain, choose one approach:

- **Approach A (direct):**
  - add the domain as an additional custom domain in the same GitHub Pages site
  - point DNS (`A` and/or `CNAME`) to GitHub Pages as above
- **Approach B (redirect):**
  - keep one canonical domain (`hoofdkantoor.info`)
  - configure STRATO domain forwarding from other domains to `https://hoofdkantoor.info`

### 4) Verify

- Wait for DNS propagation.
- Visit `https://hoofdkantoor.info` and `https://www.hoofdkantoor.info`.
- Confirm PALACO loads and HTTPS certificate is active.

## Bulk rollout for all repositories

Reusable template files are available at:

- `/home/runner/work/PALACO-Citadel/PALACO-Citadel/templates/github-pages/pages.yml`
- `/home/runner/work/PALACO-Citadel/PALACO-Citadel/templates/github-pages/CNAME.example`
- `/home/runner/work/PALACO-Citadel/PALACO-Citadel/templates/github-pages/README.md`
- `/home/runner/work/PALACO-Citadel/PALACO-Citadel/templates/github-pages/BULK-ROLLOUT.md`
