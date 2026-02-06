# Sling Scheduler UI

Static frontend that calls backend API only.

## Local Preview
Serve this folder with any static server. Example:
```bash
python3 -m http.server 4173
```

Set backend base URL before loading the app:
```js
// app/ui/config.js
window.__SCHEDULER_API_BASE__ = 'https://<cloud-run-url>';
```

For Netlify deploys, this can be injected automatically by workflow using a GitHub secret.

## Caspio Date Handoff
The app reads `?date=MM/DD/YYYY` and auto-loads schedule for that date.
