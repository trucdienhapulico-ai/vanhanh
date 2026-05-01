const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { execFileSync, execSync } = require('child_process');
const { KysonClient } = require('../scripts/kyson-client');
const { generateDailyReport } = require('../scripts/kyson-water-report');

const PORT = Number(process.env.PORT || 3080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(ROOT, 'backups');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const VERSION_STORE_DIR = path.join(ROOT, '..', 'state', 'webapp-versions');
const CODE_BACKUP_SCRIPT = path.join(ROOT, '..', 'scripts', 'webapp-backup-version.sh');
const CODE_RESTORE_SCRIPT = path.join(ROOT, '..', 'scripts', 'webapp-restore-version.sh');
const sessions = new Map();
let schedulerTimer = null;
let schedulerState = { running: false };

const APP_INFO = (() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  let gitCommit = 'unknown';
  try { gitCommit = execSync('git rev-parse --short HEAD', { cwd: path.join(ROOT, '..') }).toString().trim(); } catch {}
  return {
    name: pkg.name,
    version: pkg.version || '0.0.0',
    gitCommit,
    display: `v${pkg.version || '0.0.0'} (${gitCommit})`,
  };
})();

for (const dir of [DATA_DIR, BACKUP_DIR, PUBLIC_DIR]) fs.mkdirSync(dir, { recursive: true });

function now() { return new Date().toISOString(); }
function today() { return now().slice(0, 10); }
function rid() { return crypto.randomBytes(16).toString('hex'); }
function normalizeDate(value) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null;
}
function listDates(from, to) {
  const out = [];
  let cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
function shiftDate(date, deltaDays) {
  const cur = new Date(`${date}T00:00:00Z`);
  cur.setUTCDate(cur.getUTCDate() + deltaDays);
  return cur.toISOString().slice(0, 10);
}
function normalizeTime(value) {
  if (!value) return null;
  const text = String(value);
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text) ? text : null;
}
function listSupportedTimeZones() {
  return [...new Set(['UTC', 'Asia/Ho_Chi_Minh', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'])];
}
function normalizeTimeZone(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'UTC';
  }
}
function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${parts.hour}:${parts.minute}`,
  };
}
function defaultKysonAutoSync() {
  return {
    enabled: false,
    time: '01:00',
    timeZone: 'UTC',
    daysBack: 1,
    lastRunAt: null,
    lastRange: null,
    lastStatus: 'idle',
    lastError: null,
  };
}
function normalizeAutoSync(input = {}) {
  const base = { ...defaultKysonAutoSync(), ...(input || {}) };
  const enabled = Boolean(base.enabled);
  const time = normalizeTime(base.time) || '01:00';
  const timeZone = normalizeTimeZone(base.timeZone);
  const daysBackNum = Math.min(30, Math.max(1, Number(base.daysBack || 1)));
  return {
    enabled,
    time,
    timeZone,
    daysBack: Math.floor(daysBackNum),
    lastRunAt: base.lastRunAt || null,
    lastRange: base.lastRange || null,
    lastStatus: base.lastStatus || 'idle',
    lastError: base.lastError || null,
  };
}
function cookieValue(req, key) {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map(x => x.trim()).find(x => x.startsWith(key + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}
function send(res, code, body, headers = {}) {
  const payload = Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
  const contentType = Buffer.isBuffer(body) || typeof body === 'string'
    ? (headers['Content-Type'] || 'text/plain; charset=utf-8')
    : 'application/json; charset=utf-8';
  res.writeHead(code, { 'Content-Type': contentType, ...headers });
  res.end(payload);
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}
function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}
function normalizeRole(role) {
  return ['admin', 'manager', 'operator', 'viewer'].includes(role) ? role : 'viewer';
}
function normalizeManagementScope(value) {
  return String(value || '').trim();
}
function normalizeChecklistImage(image = {}) {
  return {
    id: image.id || rid(),
    name: image.name || 'image.jpg',
    type: image.type || 'image/jpeg',
    dataUrl: image.dataUrl || '',
    uploadedAt: image.uploadedAt || now(),
  };
}
function normalizeChecklistShift(value) {
  const allowed = ['morning', 'afternoon', 'night'];
  return allowed.includes(value) ? value : 'morning';
}
function checklistEntryDate(value) {
  return String(value || '').slice(0, 10);
}
function findChecklistEntry(item, date, shift) {
  const targetDate = normalizeDate(date) || today();
  const targetShift = normalizeChecklistShift(shift);
  return (item.history || []).slice().reverse().find(entry => checklistEntryDate(entry.checkedAt) === targetDate && normalizeChecklistShift(entry.shift) === targetShift) || null;
}
function summarizeChecklistReport(devices, { date, shift, user } = {}) {
  const targetDate = normalizeDate(date) || today();
  const targetShift = shift ? normalizeChecklistShift(shift) : null;
  const targetUser = user ? String(user).trim() : '';
  const rows = [];
  const byUser = new Map();
  for (const device of devices) {
    for (const item of device.items || []) {
      const entry = (item.history || []).slice().reverse().find(history => {
        if (checklistEntryDate(history.checkedAt) !== targetDate) return false;
        if (targetShift && normalizeChecklistShift(history.shift) !== targetShift) return false;
        if (targetUser && history.checkedBy !== targetUser) return false;
        return true;
      }) || null;
      rows.push({
        deviceId: device.id,
        deviceName: device.name,
        area: device.area || '',
        itemId: item.id,
        itemTitle: item.title,
        checked: Boolean(entry?.checked),
        checkedAt: entry?.checkedAt || null,
        checkedBy: entry?.checkedBy || null,
        shift: entry?.shift || null,
        note: entry?.note || '',
      });
      if (entry?.checkedBy) {
        const key = entry.checkedBy;
        const current = byUser.get(key) || { user: key, checked: 0, total: 0 };
        current.total += 1;
        if (entry.checked) current.checked += 1;
        byUser.set(key, current);
      }
    }
  }
  return {
    date: targetDate,
    shift: targetShift,
    user: targetUser || null,
    summary: {
      totalItems: rows.length,
      checkedItems: rows.filter(x => x.checked).length,
      uncheckedItems: rows.filter(x => !x.checked).length,
    },
    byUser: [...byUser.values()].sort((a, b) => a.user.localeCompare(b.user)),
    rows,
  };
}
function normalizeChecklistItem(item = {}) {
  return {
    id: item.id || rid(),
    title: item.title || 'Hạng mục chưa đặt tên',
    note: item.note || '',
    createdAt: item.createdAt || now(),
    checked: Boolean(item.checked),
    lastCheckedAt: item.lastCheckedAt || null,
    lastCheckedBy: item.lastCheckedBy || null,
    checkNote: item.checkNote || '',
    lastShift: normalizeChecklistShift(item.lastShift),
    images: Array.isArray(item.images) ? item.images.filter(x => x && x.dataUrl).map(normalizeChecklistImage) : [],
    history: Array.isArray(item.history) ? item.history.slice(-20).map(entry => ({
      id: entry.id || rid(),
      checked: Boolean(entry.checked),
      checkedAt: entry.checkedAt || now(),
      checkedBy: entry.checkedBy || null,
      shift: normalizeChecklistShift(entry.shift),
      note: entry.note || '',
    })) : [],
  };
}
function ensureDbShape(db) {
  if (!Array.isArray(db.users)) db.users = [];
  db.users = db.users.map(user => ({
    ...user,
    role: normalizeRole(user.role),
    managementScope: normalizeManagementScope(user.managementScope),
  }));
  if (!Array.isArray(db.records)) db.records = [];
  if (!db.checklist || typeof db.checklist !== 'object') db.checklist = {};
  if (!Array.isArray(db.checklist.devices)) db.checklist.devices = [];
  db.checklist.devices = db.checklist.devices.map(device => ({
    id: device.id || rid(),
    name: device.name || 'Thiết bị chưa đặt tên',
    area: device.area || '',
    note: device.note || '',
    createdAt: device.createdAt || now(),
    items: Array.isArray(device.items) ? device.items.map(normalizeChecklistItem) : [],
  }));
  if (!db.kyson || typeof db.kyson !== 'object') db.kyson = {};
  if (!db.kyson.snapshot || typeof db.kyson.snapshot !== 'object') db.kyson.snapshot = {};
  if (!Array.isArray(db.kyson.users)) db.kyson.users = [];
  if (!Array.isArray(db.kyson.log)) db.kyson.log = [];
  if (!db.kyson.reports || typeof db.kyson.reports !== 'object') db.kyson.reports = {};
  db.kyson.autoSync = normalizeAutoSync(db.kyson.autoSync);
  return db;
}
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const seed = hashPassword('admin123!');
    const db = ensureDbShape({
      users: [{ id: rid(), username: 'admin', role: 'admin', managementScope: 'Toàn hệ thống', createdAt: now(), salt: seed.salt, hash: seed.hash }],
      records: [{ id: rid(), title: 'Khởi tạo hệ thống', status: 'open', note: 'Bản local sẵn sàng vận hành.', createdBy: 'system', createdAt: now() }],
      checklist: {
        devices: [
          {
            id: rid(),
            name: 'Máy bơm tổng',
            area: 'Trạm bơm',
            note: 'Checklist mẫu khởi tạo',
            createdAt: now(),
            items: [
              { id: rid(), title: 'Kiểm tra nguồn điện', note: '', createdAt: now() },
              { id: rid(), title: 'Kiểm tra áp lực', note: '', createdAt: now() },
            ],
          },
        ],
      }
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  return ensureDbShape(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
}
function saveDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function requireAuth(req, res) {
  const sid = cookieValue(req, 'sid');
  const me = sid ? sessions.get(sid) : null;
  if (!me) { send(res, 401, { error: 'Chưa đăng nhập' }); return null; }
  return me;
}
function requireRole(me, roles, res) {
  if (!roles.includes(me.role)) { send(res, 403, { error: 'Không đủ quyền' }); return false; }
  return true;
}
function toCsv(records) {
  const cols = ['id', 'createdAt', 'createdBy', 'title', 'status', 'note'];
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [cols.join(','), ...records.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
function staticFile(filePath, res) {
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  if (!fs.existsSync(filePath)) return send(res, 404, 'Not found');
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  send(res, 200, fs.readFileSync(filePath), { 'Content-Type': types[ext] || 'application/octet-stream' });
}
function parseMeta(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const out = {};
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx > -1) out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}
function listCodeBackups() {
  fs.mkdirSync(VERSION_STORE_DIR, { recursive: true });
  return fs.readdirSync(VERSION_STORE_DIR)
    .filter(name => name.endsWith('.meta'))
    .sort()
    .reverse()
    .map(name => {
      const meta = parseMeta(path.join(VERSION_STORE_DIR, name));
      return {
        name: meta.name || name.replace(/\.meta$/, ''),
        createdAt: meta.created_at_utc || null,
        label: meta.label || '',
        gitCommit: meta.git_commit || 'unknown',
        archive: meta.archive || name.replace(/\.meta$/, '.tar.gz'),
      };
    });
}
function createCodeBackup(label = 'manual-ui') {
  const output = execFileSync(CODE_BACKUP_SCRIPT, [label], { cwd: path.join(ROOT, '..') }).toString();
  const backups = listCodeBackups();
  return { output, latest: backups[0] || null };
}
function restoreCodeBackup(name) {
  const output = execFileSync(CODE_RESTORE_SCRIPT, [name], { cwd: path.join(ROOT, '..') }).toString();
  return {
    output,
    note: 'Code đã được khôi phục trên đĩa. Cần restart ops-standard.service để áp dụng bản restore.',
  };
}
async function syncKyson(body = {}) {
  const from = normalizeDate(body.dateFrom) || today();
  const to = normalizeDate(body.dateTo) || from;
  if (from > to) throw new Error('Khoảng ngày không hợp lệ');

  const client = new KysonClient();
  await client.login();
  const [check, pumps, sensors, statuses, grafana, settings, users, log] = await Promise.all([
    client.checkLogined(),
    client.getPumps(),
    client.getSensors(),
    client.getStatus(),
    client.getGrafana(),
    client.getSettings(),
    client.getUsers(),
    client.getLog(),
  ]);

  const reports = {};
  for (const date of listDates(from, to)) {
    reports[date] = await generateDailyReport(date, client);
  }

  return {
    syncedAt: now(),
    requestedRange: { from, to },
    snapshot: {
      user_info: check.user_info || null,
      role: check.role || [],
      pump: pumps.data || pumps.pump || check.pump || [],
      sensor: sensors.data || sensors.sensor || check.sensor || [],
      status: statuses.data || statuses.status || check.status || [],
      grafana: grafana.data || grafana.grafana || check.grafana || [],
      setting: settings.data || settings.setting || check.setting || [],
    },
    users: users.data || users.users || [],
    log: log.data || log.log || [],
    reports,
  };
}
function summarizeKysonSync(synced) {
  return {
    ok: true,
    syncedAt: synced.syncedAt,
    range: synced.requestedRange,
    counts: {
      pumps: synced.snapshot.pump.length,
      sensors: synced.snapshot.sensor.length,
      statuses: synced.snapshot.status.length,
      settings: synced.snapshot.setting.length,
      users: synced.users.length,
      logs: synced.log.length,
      reports: Object.keys(synced.reports).length,
    },
  };
}
async function runAutoSync(reason = 'schedule') {
  if (schedulerState.running) return false;
  schedulerState.running = true;
  try {
    const db = loadDb();
    const autoSync = normalizeAutoSync(db.kyson.autoSync);
    if (!autoSync.enabled) return false;
    const to = zonedParts(new Date(), autoSync.timeZone).date;
    const from = shiftDate(to, -(autoSync.daysBack - 1));
    db.kyson.autoSync = { ...autoSync, lastStatus: 'running', lastError: null, lastRange: { from, to, reason } };
    saveDb(db);
    const synced = await syncKyson({ dateFrom: from, dateTo: to });
    const updated = loadDb();
    updated.kyson = synced;
    updated.kyson.autoSync = {
      ...normalizeAutoSync(updated.kyson.autoSync),
      enabled: autoSync.enabled,
      time: autoSync.time,
      timeZone: autoSync.timeZone,
      daysBack: autoSync.daysBack,
      lastRunAt: synced.syncedAt,
      lastRange: { from, to, reason },
      lastStatus: 'ok',
      lastError: null,
    };
    saveDb(updated);
    return true;
  } catch (err) {
    const db = loadDb();
    db.kyson.autoSync = {
      ...normalizeAutoSync(db.kyson.autoSync),
      lastStatus: 'error',
      lastError: String(err.message || err),
    };
    saveDb(db);
    console.error('Kyson auto sync error:', err.message || err);
    return false;
  } finally {
    schedulerState.running = false;
  }
}
function schedulerTick() {
  const db = loadDb();
  const autoSync = normalizeAutoSync(db.kyson.autoSync);
  if (!autoSync.enabled) return;
  const currentParts = zonedParts(new Date(), autoSync.timeZone);
  const lastRunDate = autoSync.lastRunAt ? zonedParts(new Date(autoSync.lastRunAt), autoSync.timeZone).date : null;
  const alreadyRan = lastRunDate === currentParts.date;
  if (currentParts.hhmm === autoSync.time && !alreadyRan) {
    runAutoSync('schedule');
  }
}
function startScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(schedulerTick, 15000);
  schedulerTick();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = loadDb();

  try {
    if (req.method === 'GET' && url.pathname === '/') return staticFile(path.join(PUBLIC_DIR, 'index.html'), res);
    if (req.method === 'GET' && url.pathname.startsWith('/public/')) return staticFile(path.join(ROOT, url.pathname), res);

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await parseBody(req);
      const user = db.users.find(u => u.username === body.username);
      if (!user || !body.password || !verifyPassword(body.password, user)) return send(res, 401, { error: 'Sai tài khoản hoặc mật khẩu' });
      const sid = rid();
      sessions.set(sid, { id: user.id, username: user.username, role: user.role, managementScope: user.managementScope || '' });
      return send(res, 200, { ok: true, username: user.username, role: user.role, managementScope: user.managementScope || '' }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/` });
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const sid = cookieValue(req, 'sid');
      if (sid) sessions.delete(sid);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }

    if (req.method === 'GET' && url.pathname === '/api/app-info') {
      return send(res, 200, { app: APP_INFO });
    }

    if (req.method === 'GET' && url.pathname === '/api/me') {
      const me = requireAuth(req, res); if (!me) return;
      return send(res, 200, me);
    }

    if (req.method === 'GET' && url.pathname === '/api/records') {
      const me = requireAuth(req, res); if (!me) return;
      return send(res, 200, { records: db.records });
    }

    if (req.method === 'GET' && url.pathname === '/api/checklist/devices') {
      const me = requireAuth(req, res); if (!me) return;
      return send(res, 200, { devices: db.checklist.devices });
    }

    if (req.method === 'GET' && url.pathname === '/api/checklist/report') {
      const me = requireAuth(req, res); if (!me) return;
      const report = summarizeChecklistReport(db.checklist.devices, {
        date: url.searchParams.get('date') || today(),
        shift: url.searchParams.get('shift') || null,
        user: url.searchParams.get('user') || null,
      });
      return send(res, 200, report);
    }

    if (req.method === 'POST' && url.pathname === '/api/checklist/devices') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const body = await parseBody(req);
      if (!body.name) return send(res, 400, { error: 'Thiếu tên thiết bị' });
      const device = {
        id: rid(),
        name: body.name,
        area: body.area || '',
        note: body.note || '',
        createdAt: now(),
        items: [],
      };
      db.checklist.devices.push(device);
      saveDb(db);
      return send(res, 200, { ok: true, device });
    }

    if (req.method === 'PUT' && url.pathname.match(/^\/api\/checklist\/devices\/[^/]+$/)) {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const id = url.pathname.split('/')[4];
      const device = db.checklist.devices.find(x => x.id === id);
      if (!device) return send(res, 404, { error: 'Không tìm thấy thiết bị' });
      const body = await parseBody(req);
      if (!body.name) return send(res, 400, { error: 'Thiếu tên thiết bị' });
      device.name = body.name;
      device.area = body.area || '';
      device.note = body.note || '';
      saveDb(db);
      return send(res, 200, { ok: true, device });
    }

    if (req.method === 'DELETE' && url.pathname.match(/^\/api\/checklist\/devices\/[^/]+$/)) {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const id = url.pathname.split('/')[4];
      const idx = db.checklist.devices.findIndex(x => x.id === id);
      if (idx < 0) return send(res, 404, { error: 'Không tìm thấy thiết bị' });
      db.checklist.devices.splice(idx, 1);
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/checklist\/devices\/[^/]+\/items$/)) {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const id = url.pathname.split('/')[4];
      const device = db.checklist.devices.find(x => x.id === id);
      if (!device) return send(res, 404, { error: 'Không tìm thấy thiết bị' });
      const body = await parseBody(req);
      if (!body.title) return send(res, 400, { error: 'Thiếu tên hạng mục' });
      const item = normalizeChecklistItem({ id: rid(), title: body.title, note: body.note || '', createdAt: now() });
      device.items.push(item);
      saveDb(db);
      return send(res, 200, { ok: true, item, device });
    }

    if (req.method === 'PUT' && url.pathname.match(/^\/api\/checklist\/devices\/[^/]+\/items\/[^/]+$/)) {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const parts = url.pathname.split('/');
      const device = db.checklist.devices.find(x => x.id === parts[4]);
      if (!device) return send(res, 404, { error: 'Không tìm thấy thiết bị' });
      const item = device.items.find(x => x.id === parts[6]);
      if (!item) return send(res, 404, { error: 'Không tìm thấy hạng mục' });
      const body = await parseBody(req);
      if (!body.title) return send(res, 400, { error: 'Thiếu tên hạng mục' });
      item.title = body.title;
      item.note = body.note || '';
      saveDb(db);
      return send(res, 200, { ok: true, item, device });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/checklist\/devices\/[^/]+\/items\/[^/]+\/check$/)) {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const parts = url.pathname.split('/');
      const device = db.checklist.devices.find(x => x.id === parts[4]);
      if (!device) return send(res, 404, { error: 'Không tìm thấy thiết bị' });
      const item = device.items.find(x => x.id === parts[6]);
      if (!item) return send(res, 404, { error: 'Không tìm thấy hạng mục' });
      const body = await parseBody(req);
      const hasIncomingImages = Array.isArray(body.images);
      const incomingImages = hasIncomingImages ? body.images : [];
      if (incomingImages.length > 4) return send(res, 400, { error: 'Tối đa 4 hình cho mỗi lần cập nhật' });
      for (const image of incomingImages) {
        if (!image || typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/')) {
          return send(res, 400, { error: 'Dữ liệu hình ảnh không hợp lệ' });
        }
        if (image.dataUrl.length > 2_500_000) return send(res, 400, { error: 'Hình ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn ~2MB' });
      }
      item.checked = body.checked !== undefined ? Boolean(body.checked) : item.checked;
      item.lastCheckedAt = body.checkedAt || now();
      item.lastCheckedBy = me.username;
      item.lastShift = normalizeChecklistShift(body.shift);
      item.checkNote = body.checkNote || '';
      if (hasIncomingImages && incomingImages.length) item.images = incomingImages.map(normalizeChecklistImage);
      item.history = [...item.history, {
        id: rid(),
        checked: item.checked,
        checkedAt: item.lastCheckedAt,
        checkedBy: item.lastCheckedBy,
        shift: item.lastShift,
        note: item.checkNote,
      }].slice(-20);
      saveDb(db);
      return send(res, 200, { ok: true, item, device });
    }

    if (req.method === 'DELETE' && url.pathname.match(/^\/api\/checklist\/devices\/[^/]+\/items\/[^/]+$/)) {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const parts = url.pathname.split('/');
      const device = db.checklist.devices.find(x => x.id === parts[4]);
      if (!device) return send(res, 404, { error: 'Không tìm thấy thiết bị' });
      const idx = device.items.findIndex(x => x.id === parts[6]);
      if (idx < 0) return send(res, 404, { error: 'Không tìm thấy hạng mục' });
      device.items.splice(idx, 1);
      saveDb(db);
      return send(res, 200, { ok: true, device });
    }

    if (req.method === 'GET' && url.pathname === '/api/kyson') {
      const me = requireAuth(req, res); if (!me) return;
      return send(res, 200, { kyson: db.kyson, scheduler: schedulerState, supportedTimeZones: listSupportedTimeZones() });
    }

    if (req.method === 'GET' && url.pathname === '/api/kyson/auto-sync') {
      const me = requireAuth(req, res); if (!me) return;
      return send(res, 200, { autoSync: db.kyson.autoSync, scheduler: schedulerState, supportedTimeZones: listSupportedTimeZones() });
    }

    if (req.method === 'POST' && url.pathname === '/api/kyson/auto-sync') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      const body = await parseBody(req);
      const autoSync = normalizeAutoSync(body);
      db.kyson.autoSync = {
        ...normalizeAutoSync(db.kyson.autoSync),
        enabled: autoSync.enabled,
        time: autoSync.time,
        timeZone: autoSync.timeZone,
        daysBack: autoSync.daysBack,
      };
      saveDb(db);
      return send(res, 200, { ok: true, autoSync: db.kyson.autoSync, supportedTimeZones: listSupportedTimeZones() });
    }

    if (req.method === 'POST' && url.pathname === '/api/kyson/sync') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const body = await parseBody(req);
      const synced = await syncKyson(body);
      db.kyson = {
        ...synced,
        autoSync: db.kyson.autoSync,
      };
      saveDb(db);
      return send(res, 200, summarizeKysonSync(db.kyson));
    }

    if (req.method === 'POST' && url.pathname === '/api/records') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin', 'operator'], res)) return;
      const body = await parseBody(req);
      if (!body.title) return send(res, 400, { error: 'Thiếu tiêu đề' });
      db.records.push({ id: rid(), title: body.title, status: body.status || 'open', note: body.note || '', createdBy: me.username, createdAt: now() });
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/code-backups') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      return send(res, 200, { app: APP_INFO, snapshots: listCodeBackups() });
    }

    if (req.method === 'POST' && url.pathname === '/api/code-backups') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      const body = await parseBody(req);
      const result = createCodeBackup(body.label || `manual-${me.username}`);
      return send(res, 200, { ok: true, app: APP_INFO, snapshot: result.latest, output: result.output });
    }

    if (req.method === 'POST' && url.pathname === '/api/code-backups/restore') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      const body = await parseBody(req);
      if (!body.name) return send(res, 400, { error: 'Thiếu tên snapshot cần khôi phục' });
      const result = restoreCodeBackup(body.name);
      return send(res, 200, { ok: true, restored: body.name, note: result.note, output: result.output });
    }

    if (req.method === 'GET' && url.pathname === '/api/users') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      return send(res, 200, { users: db.users.map(({ hash, salt, ...u }) => ({ ...u, role: normalizeRole(u.role), managementScope: normalizeManagementScope(u.managementScope) })) });
    }

    if (req.method === 'POST' && url.pathname === '/api/users') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      const body = await parseBody(req);
      if (!body.username || !body.password || !body.role) return send(res, 400, { error: 'Thiếu thông tin user' });
      if (db.users.some(u => u.username === body.username)) return send(res, 400, { error: 'User đã tồn tại' });
      if (!['admin', 'manager', 'operator', 'viewer'].includes(body.role)) return send(res, 400, { error: 'Role không hợp lệ' });
      const seed = hashPassword(body.password);
      db.users.push({ id: rid(), username: body.username, role: body.role, managementScope: normalizeManagementScope(body.managementScope), createdAt: now(), salt: seed.salt, hash: seed.hash });
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/me/change-password') {
      const me = requireAuth(req, res); if (!me) return;
      const body = await parseBody(req);
      if (!body.currentPassword || !body.newPassword) return send(res, 400, { error: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới' });
      if (String(body.newPassword).length < 6) return send(res, 400, { error: 'Mật khẩu mới phải từ 6 ký tự' });
      const user = db.users.find(u => u.id === me.id);
      if (!user) return send(res, 404, { error: 'Không tìm thấy tài khoản' });
      if (!verifyPassword(body.currentPassword, user)) return send(res, 400, { error: 'Mật khẩu hiện tại không đúng' });
      const seed = hashPassword(body.newPassword);
      user.salt = seed.salt;
      user.hash = seed.hash;
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/backup') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      const file = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const full = path.join(BACKUP_DIR, file);
      fs.writeFileSync(full, JSON.stringify({ createdAt: now(), db }, null, 2));
      return send(res, 200, { ok: true, file: full });
    }

    if (req.method === 'GET' && url.pathname === '/api/export') {
      const me = requireAuth(req, res); if (!me) return;
      const format = (url.searchParams.get('format') || 'json').toLowerCase();
      if (format === 'csv') {
        return send(res, 200, toCsv(db.records), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ops-records.csv"' });
      }
      return send(res, 200, JSON.stringify(db.records, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="ops-records.json"' });
    }

    return send(res, 404, { error: 'Không tìm thấy' });
  } catch (err) {
    return send(res, 500, { error: String(err.message || err) });
  }
});

const HOST = process.env.HOST || '0.0.0.0';

startScheduler();
server.listen(PORT, HOST, () => {
  console.log(`Ops Standard Local running at http://${HOST}:${PORT}`);
});
