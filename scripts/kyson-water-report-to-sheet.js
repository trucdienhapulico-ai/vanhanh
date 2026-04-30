#!/usr/bin/env node

const { KysonClient } = require('./kyson-client');

const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);
const WEBHOOK_URL = process.env.GOOGLE_APPS_SCRIPT_URL || '';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'water_report';

function secondsBetween(a, b) {
  return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 1000));
}

function formatDuration(totalSeconds) {
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return [hh, mm, ss].map(v => String(v).padStart(2, '0')).join(':');
}

function buildDailyReport(date, rows, pumps) {
  const byTid = new Map();
  for (const row of rows) {
    if (Number(row.state) === 0) continue;
    const begin = String(row.time_begin || '');
    const end = String(row.time_end || '');
    let item = { ...row };

    if (begin.startsWith(date) && end.startsWith(date)) {
      item.ss = Number(item.ss ?? secondsBetween(begin, end));
    } else if (begin.startsWith(date) && !end.startsWith(date)) {
      item = { ...item, time_end: `${date} 23:59:59` };
      item.ss = secondsBetween(item.time_begin, item.time_end);
    } else if (!begin.startsWith(date) && end.startsWith(date)) {
      item = { ...item, time_begin: `${date} 00:00:00` };
      item.ss = secondsBetween(item.time_begin, item.time_end);
    } else {
      continue;
    }

    const tid = Number(item.tid);
    if (!byTid.has(tid)) byTid.set(tid, []);
    byTid.get(tid).push(item);
  }

  const items = [];
  for (const [tid, list] of [...byTid.entries()].sort((a, b) => a[0] - b[0])) {
    const pump = pumps.get(tid) || { name: `TID ${tid}`, flow: 0 };
    const flow = Number(pump.flow || 0);
    const runs = list.map((x) => ({
      tid,
      pump_name: pump.name,
      flow_m3h: flow,
      begin: x.time_begin,
      end: x.time_end,
      duration_seconds: Number(x.ss || 0),
      duration_hms: formatDuration(Number(x.ss || 0)),
      subtotal_m3: Math.round((flow * Number(x.ss || 0) / 3600) * 100) / 100,
    })).sort((a, b) => a.begin.localeCompare(b.begin));

    items.push({
      tid,
      pump_name: pump.name,
      flow_m3h: flow,
      total_seconds: runs.reduce((s, x) => s + x.duration_seconds, 0),
      total_duration_hms: formatDuration(runs.reduce((s, x) => s + x.duration_seconds, 0)),
      total_m3: Math.round(runs.reduce((s, x) => s + x.subtotal_m3, 0) * 100) / 100,
      runs,
    });
  }

  return {
    date,
    pump_count: items.length,
    total_duration_seconds: items.reduce((s, x) => s + x.total_seconds, 0),
    total_duration_hms: formatDuration(items.reduce((s, x) => s + x.total_seconds, 0)),
    total_m3: Math.round(items.reduce((s, x) => s + x.total_m3, 0) * 100) / 100,
    items,
  };
}

function flattenRows(report) {
  return report.items.flatMap(item => item.runs.map(run => ({
    date: report.date,
    tid: run.tid,
    pump_name: run.pump_name,
    flow_m3h: run.flow_m3h,
    begin: run.begin,
    end: run.end,
    duration_seconds: run.duration_seconds,
    duration_hms: run.duration_hms,
    subtotal_m3: run.subtotal_m3,
    pump_total_seconds: item.total_seconds,
    pump_total_duration_hms: item.total_duration_hms,
    pump_total_m3: item.total_m3,
  })));
}

(async () => {
  try {
    if (!WEBHOOK_URL) throw new Error('Missing GOOGLE_APPS_SCRIPT_URL');

    const client = new KysonClient();
    const login = await client.login();
    const reportRaw = await client.getReport(DATE);
    const pumps = new Map((login.pump || []).map(p => [Number(p.id), p]));
    const report = buildDailyReport(DATE, reportRaw.data || [], pumps);
    const rows = flattenRows(report);

    const payload = {
      action: 'upsert_water_report',
      sheetName: SHEET_NAME,
      report,
      rows,
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Sheet webhook HTTP ${res.status}`);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
