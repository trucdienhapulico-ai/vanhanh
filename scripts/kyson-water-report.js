#!/usr/bin/env node

const { KysonClient } = require('./kyson-client');
const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);

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
  let totalSeconds = 0;
  let totalM3 = 0;

  for (const [tid, list] of [...byTid.entries()].sort((a, b) => a[0] - b[0])) {
    const pump = pumps.get(tid) || { name: `TID ${tid}`, flow: 0 };
    const flow = Number(pump.flow || 0);
    const details = list.map((x) => {
      const m3 = Math.round((flow * Number(x.ss || 0) / 3600) * 100) / 100;
      return {
        tid,
        pump_name: pump.name,
        flow_m3h: flow,
        begin: x.time_begin,
        end: x.time_end,
        duration_seconds: Number(x.ss || 0),
        duration_hms: formatDuration(Number(x.ss || 0)),
        subtotal_m3: m3,
      };
    }).sort((a, b) => a.begin.localeCompare(b.begin));

    const pumpSeconds = details.reduce((s, x) => s + x.duration_seconds, 0);
    const pumpM3 = Math.round(details.reduce((s, x) => s + x.subtotal_m3, 0) * 100) / 100;
    totalSeconds += pumpSeconds;
    totalM3 += pumpM3;

    items.push({
      tid,
      pump_name: pump.name,
      flow_m3h: flow,
      total_seconds: pumpSeconds,
      total_duration_hms: formatDuration(pumpSeconds),
      total_m3: pumpM3,
      runs: details,
    });
  }

  return {
    date,
    pump_count: items.length,
    total_duration_seconds: totalSeconds,
    total_duration_hms: formatDuration(totalSeconds),
    total_m3: Math.round(totalM3 * 100) / 100,
    items,
  };
}

async function generateDailyReport(date, client = new KysonClient()) {
  const login = await client.login();
  const report = await client.getReport(date);
  const pumps = new Map((login.pump || []).map(p => [Number(p.id), p]));
  return buildDailyReport(date, report.data || [], pumps);
}

module.exports = {
  secondsBetween,
  formatDuration,
  buildDailyReport,
  generateDailyReport,
};

if (require.main === module) {
  (async () => {
    try {
      const output = await generateDailyReport(DATE);
      console.log(JSON.stringify(output, null, 2));
    } catch (err) {
      console.error('ERROR:', err.message);
      process.exit(1);
    }
  })();
}
