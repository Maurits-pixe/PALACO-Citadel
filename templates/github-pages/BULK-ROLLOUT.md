# Bulk rollout runbook (all repositories)

Use this runbook to apply the same GitHub Pages + custom domain setup to multiple repositories.

## Per repository file changes

1. Copy `templates/github-pages/pages.yml` to `.github/workflows/pages.yml`.
2. Copy `templates/github-pages/CNAME.example` to `CNAME`.
3. Replace `CNAME` content with the domain for that repository.
4. Apply the client update behavior described in `templates/github-pages/PWA-AUTO-UPDATE.md`.

## Per repository GitHub settings

1. Open **Settings → Pages**.
2. Source: **GitHub Actions**.
3. Set custom domain equal to `CNAME`.
4. Enable **Enforce HTTPS** after DNS is ready.

## STRATO DNS records per custom domain

- `A @` → `185.199.108.153`
- `A @` → `185.199.109.153`
- `A @` → `185.199.110.153`
- `A @` → `185.199.111.153`
- `CNAME www` → `maurits-pixe.github.io`

## Rollout tracking checklist

For each repository, confirm:

- workflow file exists at `.github/workflows/pages.yml`
- `CNAME` exists with correct domain
- GitHub Pages source is **GitHub Actions**
- DNS records are created in STRATO
- `https://domain.tld` is online
- `https://www.domain.tld` is online
- HTTPS certificate is active
- service worker/network update logic is present for shell assets
- new deployments appear without manual cache clearing
- installed app/PWA clients update automatically
- live content refresh still works after returning to the page
