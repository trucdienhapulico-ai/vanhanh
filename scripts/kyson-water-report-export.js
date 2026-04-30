#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { KysonClient } = require('./kyson-client');

const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);
const FORMAT = (process.argv[3] || 'json').toLowerCase();
const OUT = process.argv[4] || '';

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
    const runs = list
      .map((x) => ({
        tid,
        pump_name: pump.name,
        flow_m3h: flow,
        begin: x.time_begin,
        end: x.time_end,
        duration_seconds: Number(x.ss || 0),
        duration_hms: formatDuration(Number(x.ss || 0)),
        subtotal_m3: Math.round((flow * Number(x.ss || 0) / 3600) * 100) / 100,
      }))
      .sort((a, b) => a.begin.localeCompare(b.begin));

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

function toCsv(report) {
  const lines = [
    ['date', 'tid', 'pump_name', 'flow_m3h', 'begin', 'end', 'duration_seconds', 'duration_hms', 'subtotal_m3'].join(','),
  ];
  for (const item of report.items) {
    for (const run of item.runs) {
      lines.push([
        report.date,
        run.tid,
        JSON.stringify(run.pump_name),
        run.flow_m3h,
        run.begin,
        run.end,
        run.duration_seconds,
        run.duration_hms,
        run.subtotal_m3,
      ].join(','));
    }
  }
  return lines.join('\n');
}

(async () => {
  try {
    const client = new KysonClient();
    const login = await client.login();
    const reportRaw = await client.getReport(DATE);
    const pumps = new Map((login.pump || []).map(p => [Number(p.id), p]));
    const report = buildDailyReport(DATE, reportRaw.data || [], pumps);

    const content = FORMAT === 'csv' ? toCsv(report) : JSON.stringify(report, null, 2);
    if (OUT) {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, content);
      console.log(OUT);
    } else {
      console.log(content);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
