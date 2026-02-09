# Netlify Setup (Detailed)

Target URL:
- `https://sling-scheduler.netlify.app`

## 1. Create site from GitHub
In Netlify:
1. `Add new site` -> `Import an existing project`
2. Choose `GitHub`
3. Select repo `Web-Wiz-Lab/clownsTesting`
4. Build settings:
- Base directory: leave empty
- Build command: leave empty
- Publish directory: `app/ui`
5. Deploy site

## 2. Get deployment credentials for GitHub Actions
From Netlify:
- User settings -> Applications -> Personal access tokens -> create token
- Site settings -> General -> Site details -> copy `Site ID`

## 3. Add GitHub secrets
Add:
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `SCHEDULER_API_BASE_URL` (Cloud Run URL)

## 4. Deploy UI from GitHub Actions
Run workflow:
- `Deploy UI to Netlify`

The workflow writes `app/ui/config.js` at deploy time with your API URL.

## 5. Caspio integration
Use this snippet:
- `integrations/caspio/manage-in-sling-launcher.html`

It already targets:
- `https://sling-scheduler.netlify.app`
