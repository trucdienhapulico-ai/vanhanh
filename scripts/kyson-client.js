#!/usr/bin/env node

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

class KysonClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.KYSON_BASE_URL || 'https://kyson.duckdns.org').replace(/\/$/, '');
    this.uid = options.uid || process.env.KYSON_UID || 'admin';
    this.pwd = options.pwd || process.env.KYSON_PWD || '123456';
    this.ck = options.ck || null;
    this.userInfo = null;
  }

  get cookie() {
    if (!this.uid || !this.ck) return '';
    return `ky_son_uid=${encodeURIComponent(this.uid)}; ky_son_ck=${encodeURIComponent(this.ck)}`;
  }

  async request(path, { method = 'GET', form, auth = true } = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {};

    if (auth && this.cookie) headers.cookie = this.cookie;
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      body = new URLSearchParams(form).toString();
    }

    const res = await fetch(url, { method, headers, body });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${path}`);
    const json = await res.json();
    if (json && json.ok === 0) throw new Error(json.msg || `API error at ${path}`);
    return json;
  }

  async login() {
    const json = await this.request('/api/login', {
      method: 'POST',
      form: { uid: this.uid, pwd: this.pwd },
      auth: false,
    });
    this.userInfo = json.user_info || null;
    this.uid = this.userInfo?.uid || this.uid;
    this.ck = this.userInfo?.ck || this.ck;
    return json;
  }

  async ensureLogin() {
    if (!this.ck) await this.login();
    return this;
  }

  async checkLogined() { await this.ensureLogin(); return this.request('/api/check_logined'); }
  async logout() { await this.ensureLogin(); return this.request('/api/logout'); }
  async getStatus() { await this.ensureLogin(); return this.request('/api/status'); }
  async getPumps() { await this.ensureLogin(); return this.request('/api/pump'); }
  async getSensors() { await this.ensureLogin(); return this.request('/api/sensor'); }
  async getGrafana() { await this.ensureLogin(); return this.request('/api/grafana'); }
  async getSettings() { await this.ensureLogin(); return this.request('/api/setting'); }
  async getUsers() { await this.ensureLogin(); return this.request('/api/users'); }
  async getLog() { await this.ensureLogin(); return this.request('/api/log'); }
  async getReport(date) {
    await this.ensureLogin();
    return this.request(`/api/report?date=${encodeURIComponent(date)}`, {
      method: 'POST',
      form: { date },
    });
  }

  async savePump({ action, id, value }) {
    await this.ensureLogin();
    return this.request('/api/save-pump', {
      method: 'POST',
      form: { action, id, value },
    });
  }

  async saveSetting({ id, value }) {
    await this.ensureLogin();
    return this.request('/api/save-setting', {
      method: 'POST',
      form: { action: 'edit_setting', id, value },
    });
  }

  async saveUser(data) {
    await this.ensureLogin();
    return this.request('/api/save-user', {
      method: 'POST',
      form: data,
    });
  }

  async snapshot() {
    await this.ensureLogin();
    const check = await this.checkLogined();
    return {
      user_info: check.user_info,
      pump: check.pump || [],
      setting: check.setting || [],
      sensor: check.sensor || [],
      status: check.status || [],
      grafana: check.grafana || [],
      role: check.role || [],
    };
  }
}

module.exports = { KysonClient };

if (require.main === module) {
  (async () => {
    const client = new KysonClient();
    const action = process.argv[2] || 'snapshot';
    const arg = process.argv[3];
    const map = {
      snapshot: () => client.snapshot(),
      report: () => client.getReport(arg || new Date().toISOString().slice(0, 10)),
      pumps: () => client.getPumps(),
      sensors: () => client.getSensors(),
      status: () => client.getStatus(),
      settings: () => client.getSettings(),
      users: () => client.getUsers(),
      log: () => client.getLog(),
      check: () => client.checkLogined(),
    };
    if (!map[action]) throw new Error(`Unsupported action: ${action}`);
    const data = await map[action]();
    console.log(JSON.stringify(data, null, 2));
  })().catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}
