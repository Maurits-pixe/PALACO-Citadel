# GitHub Pages + STRATO rollout template

Use this template in each repository.

## Files to copy into each repository

- `pages.yml` → `.github/workflows/pages.yml`
- `CNAME.example` → `CNAME` (replace with your real domain)

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
