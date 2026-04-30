const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(ROOT, 'backups');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const sessions = new Map();

for (const dir of [DATA_DIR, BACKUP_DIR, PUBLIC_DIR]) fs.mkdirSync(dir, { recursive: true });

function now() { return new Date().toISOString(); }
function rid() { return crypto.randomBytes(16).toString('hex'); }
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
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const seed = hashPassword('admin123!');
    const db = {
      users: [{ id: rid(), username: 'admin', role: 'admin', createdAt: now(), salt: seed.salt, hash: seed.hash }],
      records: [{ id: rid(), title: 'Khởi tạo hệ thống', status: 'open', note: 'Bản local sẵn sàng vận hành.', createdBy: 'system', createdAt: now() }]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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
      sessions.set(sid, { id: user.id, username: user.username, role: user.role });
      return send(res, 200, { ok: true, username: user.username, role: user.role }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/` });
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const sid = cookieValue(req, 'sid');
      if (sid) sessions.delete(sid);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }

    if (req.method === 'GET' && url.pathname === '/api/me') {
      const me = requireAuth(req, res); if (!me) return;
      return send(res, 200, me);
    }

    if (req.method === 'GET' && url.pathname === '/api/records') {
      const me = requireAuth(req, res); if (!me) return;
      return send(res, 200, { records: db.records });
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

    if (req.method === 'GET' && url.pathname === '/api/users') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      return send(res, 200, { users: db.users.map(({ hash, salt, ...u }) => u) });
    }

    if (req.method === 'POST' && url.pathname === '/api/users') {
      const me = requireAuth(req, res); if (!me) return;
      if (!requireRole(me, ['admin'], res)) return;
      const body = await parseBody(req);
      if (!body.username || !body.password || !body.role) return send(res, 400, { error: 'Thiếu thông tin user' });
      if (db.users.some(u => u.username === body.username)) return send(res, 400, { error: 'User đã tồn tại' });
      if (!['admin', 'operator', 'viewer'].includes(body.role)) return send(res, 400, { error: 'Role không hợp lệ' });
      const seed = hashPassword(body.password);
      db.users.push({ id: rid(), username: body.username, role: body.role, createdAt: now(), salt: seed.salt, hash: seed.hash });
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

server.listen(PORT, HOST, () => {
  console.log(`Ops Standard Local running at http://${HOST}:${PORT}`);
});
