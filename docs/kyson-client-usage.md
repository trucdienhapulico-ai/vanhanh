# Kyson client usage

## Files
- `scripts/kyson-client.js` — reusable Node client for auth + core endpoints
- `scripts/kyson-water-report.js` — JSON water report summary
- `scripts/kyson-water-report-export.js` — export report as JSON or CSV

## Environment variables
- `KYSON_BASE_URL` (default: `https://kyson.duckdns.org`)
- `KYSON_UID`
- `KYSON_PWD`

## Quick commands
### Get pump list
```bash
node scripts/kyson-client.js pumps
```

### Get full authenticated snapshot
```bash
node scripts/kyson-client.js snapshot
```

### Get daily water report as JSON
```bash
node scripts/kyson-water-report.js 2026-04-26
```

### Export daily water report as CSV
```bash
node scripts/kyson-water-report-export.js 2026-04-26 csv tmp/kyson-report-2026-04-26.csv
```

## Endpoints wrapped
- login
- check_logined
- logout
- status
- pump
- sensor
- grafana
- setting
- users
- log
- report
- save-pump
- save-setting
- save-user

## Verified
- `kyson-client.js pumps` -> OK
- `kyson-water-report.js 2026-04-26` -> OK
- `kyson-water-report-export.js 2026-04-26 csv ...` -> OK

## Note
Current live report data for `2026-04-26` returned no report rows, so the generated JSON/CSV is empty but valid.
