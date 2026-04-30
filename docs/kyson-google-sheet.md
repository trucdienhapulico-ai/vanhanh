# Kyson -> Google Sheet

## Files
- `scripts/kyson-water-report-to-sheet.js`

## Flow
1. Node script gets Kyson report
2. Script posts JSON to a Google Apps Script Web App
3. Apps Script writes rows into Google Sheet

## Run
```bash
GOOGLE_APPS_SCRIPT_URL='https://script.google.com/macros/s/XXX/exec' \
GOOGLE_SHEET_NAME='water_report' \
node scripts/kyson-water-report-to-sheet.js 2026-04-26
```

## Suggested Apps Script
Paste into **Extensions -> Apps Script** of the target Google Sheet:

```javascript
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(body.sheetName || 'water_report') || ss.insertSheet(body.sheetName || 'water_report');

    const headers = [
      'date',
      'tid',
      'pump_name',
      'flow_m3h',
      'begin',
      'end',
      'duration_seconds',
      'duration_hms',
      'subtotal_m3',
      'pump_total_seconds',
      'pump_total_duration_hms',
      'pump_total_m3'
    ];

    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    }

    if (rows.length === 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, msg: 'no rows', sheet: sheet.getName() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const existing = sheet.getDataRange().getValues();
    const keep = [existing[0] || headers].concat(existing.slice(1).filter(r => r[0] !== body.report.date));

    sheet.clearContents();
    sheet.getRange(1, 1, keep.length, headers.length).setValues(keep);

    const values = rows.map(r => headers.map(h => r[h] ?? ''));
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, appended: values.length, sheet: sheet.getName(), date: body.report.date }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, msg: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

## Deploy
- Deploy -> New deployment
- Type: **Web app**
- Execute as: **Me**
- Who has access: **Anyone with the link** (or tighten later)
- Copy the Web App URL into `GOOGLE_APPS_SCRIPT_URL`

## Notes
- Current script replaces rows for the same `date`, then appends fresh rows
- This keeps one clean dataset per day
- If you want, next step I can add:
  - summary sheet
  - pivot-ready sheet
  - auto formatting
  - daily cron push
