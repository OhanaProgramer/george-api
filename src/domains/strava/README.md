# Strava Source Module (v1)

This module is additive and disabled by default.

## Required env vars

- `STRAVA_ENABLED` (default: `0`)
- `STRAVA_TOKEN_FILE`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI` (optional for v1 self-test; included for OAuth parity)

## Self-test endpoint

`GET /admin/strava/selftest?per_page=5&page=1`

Example:

```bash
curl -H "Authorization: Bearer <admin_token>" \
  "http://127.0.0.1:3000/admin/strava/selftest?per_page=5&page=1"
```
