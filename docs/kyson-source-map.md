# Kyson public source map

## What is publicly readable from the live site
- `/` -> main HTML shell
- `/js/kyson.js?v=5` -> main frontend logic
- `/css/kyson.css?v=5` -> main styling/layout
- static assets referenced by HTML/CSS (icons, images, CDN libs)
- websocket endpoint pattern: `/api/ws`
- API endpoints used by frontend under `/api`

## What is not directly readable from the live site
- backend source code on the server
- directory listings for `/js/`, `/css/`, `/icon/` (403)
- any private repo/files not exposed via HTTP

## Frontend structure
### Main tabs
- Overview
- Status
- Detail
- Report
- Manager

### Main initialization flow
1. `check_login()`
2. `GET /api/check_logined`
3. if not logged in -> login dialog -> `POST /api/login`
4. `web_init(json)`
5. `save_data(json)` then initialize overview/status/sensor UI and websocket

### Session/auth model
- login response includes `user_info.ck`
- frontend stores:
  - `ky_son_uid`
  - `ky_son_ck`
- kept in both cookie and localStorage
- subsequent API access depends on those credentials

## API surface observed from frontend
### Read endpoints
- `GET /api/check_logined`
- `GET /api/logout`
- `GET /api/status`
- `GET /api/pump`
- `GET /api/sensor`
- `GET /api/grafana`
- `GET /api/setting`
- `GET /api/users`
- `GET /api/log`

### Write endpoints
- `POST /api/login`
  - fields: `uid`, `pwd`
- `POST /api/report?date=YYYY-MM-DD`
  - body: `date`
- `POST /api/save-pump`
  - used for editing `state` and `flow`
- `POST /api/save-setting`
  - used with action `edit_setting`
- `POST /api/save-user`
  - used with actions:
    - `add_user`
    - `edit_user`

### WebSocket
- `ws(s)://<host>/api/ws`
- used for live sensor/status updates

## Data domains in frontend
- `pump`
  - id, auto, name, flow, state, flow_ss, state_ss
- `sensor`
  - id, tid, name, unit, value, ss
- `status`
  - run windows used by report/status tables
- `setting`
  - app title, slogan, refresh interval, labels, formatting flags
- `grafana`
  - embedded chart/dashboard config
- `users`
  - user management for admin/operator flows
- `role`
  - role definitions 0/1/2/100

## Report logic
- report tab calls `POST /api/report?date=...`
- frontend combines returned status rows with `pump.flow`
- output per pump includes:
  - begin/end
  - duration
  - subtotal m3
  - total duration per pump
  - total m3 per pump
- if a run spans across date boundaries, frontend clips to the requested day before calculating totals

## Manager area modules
- Flow (pump management)
- User management
- Setting
- Log

## Development direction options
1. Build a clean Node API client wrapper around current endpoints
2. Build a dedicated water-report exporter (JSON/CSV/Excel)
3. Rebuild report UI as a smaller standalone page/module
4. Add Discord automation to fetch and post daily report summaries
5. Reverse-engineer websocket payloads for realtime monitoring features
