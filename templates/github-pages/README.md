# GitHub Pages + STRATO rollout template

Use this template in each repository.

## Files to copy into each repository

- `pages.yml` → `.github/workflows/pages.yml`
- `CNAME.example` → `CNAME` (replace with your real domain)
- `PWA-AUTO-UPDATE.md` → implementation reference for website/app auto-refresh behavior

## GitHub setup per repository

1. Settings → Pages
2. Source: **GitHub Actions**
3. Set custom domain that matches `CNAME`
4. Enable HTTPS after DNS is valid

## STRATO DNS for apex domain

- `A @` → `185.199.108.153`
- `A @` → `185.199.109.153`
- `A @` → `185.199.110.153`
- `A @` → `185.199.111.153`
- `CNAME www` → `maurits-pixe.github.io`

## Automatic update baseline

Apply the same two-layer update model in each PALACO website/app repository:

1. **Deployment auto-update**
   - every push to `main` deploys automatically through `.github/workflows/pages.yml`
   - GitHub Pages source stays on **GitHub Actions**

2. **Client auto-update**
   - the PWA/service worker must revalidate shell assets from the network
   - a newly installed service worker should activate without manual waiting
   - open clients should reload onto the newest shell
   - live homepage/content data should refresh automatically on focus return and periodic intervals

## Verification

After rollout, confirm:

- a push to `main` publishes a new Pages deployment
- the site serves the new shell without manual cache clearing
- installed app/PWA clients refresh to the newest version
- live content refresh still works if service-worker registration fails
