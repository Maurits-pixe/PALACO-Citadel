# PWA automatic update reference

Use this pattern in every PALACO website/app repository that is deployed through GitHub Pages.

## Goal

Ensure deployed changes become visible automatically for:

- website visitors
- installed PWA/app users
- returning users with cached content

## Required behavior

### 1. Deploy automatically

- GitHub Pages deploys on every push to `main`
- workflow source remains **GitHub Actions**

### 2. Revalidate the shell

The service worker should:

- cache only explicit shell assets
- prefer the network for those shell assets
- fall back to cache when offline
- avoid serving the homepage HTML as fallback for markdown/data/document requests

### 3. Activate updates immediately

The app should:

- detect a waiting or newly installed service worker
- trigger `skipWaiting`
- reload the active client when controller ownership changes

### 4. Refresh live content automatically

The app should refresh content sources automatically:

- on first load
- when the page becomes visible again
- on a fixed interval
- when the user explicitly presses a sync/update control

### 5. Fail safely

- if service-worker registration fails, live content refresh must still keep working
- if remote API calls fail, fallback/cached content must remain available

## Minimum validation

- syntax check app/service-worker files
- confirm HTTP-served shell contains the new cache version
- confirm live content reload still works
- confirm secrets scan is clean before commit
