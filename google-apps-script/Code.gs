/**
 * Google Apps Script endpoint for the ООО «Вектор Сервис» website.
 *
 * Setup:
 * 1. Create a Google Spreadsheet dedicated to website leads.
 * 2. Paste its ID into SPREADSHEET_ID below.
 * 3. Deploy this project as a Web App (execute as the owner).
 * 4. Copy the Web App URL into GOOGLE_APPS_SCRIPT_URL in index.html.
 *
 * Collect only the minimum data needed to call the visitor back.
 * Do not use this sheet for medical records, military unit details,
 * passport scans, or other sensitive case documents.
 */

const SPREADSHEET_ID = 'PASTE_GOOGLE_SPREADSHEET_ID_HERE';
const SHEET_NAME = 'Заявки с сайта';
const HEADERS = [
  'Дата и время',
  'Имя',
  'Телефон',
  'Направление обращения',
  'Краткий комментарий',
  'Согласие на обработку ПДн',
  'Источник'
];

function doPost(e) {
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw) return response_(false);

    const data = JSON.parse(raw);

    // Honeypot: likely automated submission. Return a neutral success
    // response without saving anything.
    if (String(data.website || '').trim()) return response_(true);

    const name = clean_(data.name, 100);
    const phone = clean_(data.phone, 40);
    const service = clean_(data.service, 160);
    const message = clean_(data.message, 500);
    const source = clean_(data.source, 300);

    if (!name || !phone || !service || data.consent !== true) {
      return response_(false);
    }

    if (!/^\+?[0-9()\s-]{7,25}$/.test(phone)) {
      return response_(false);
    }

    if (SPREADSHEET_ID === 'PASTE_GOOGLE_SPREADSHEET_ID_HERE') {
      throw new Error('Spreadsheet ID is not configured');
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      let sheet = spreadsheet.getSheetByName(SHEET_NAME);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(SHEET_NAME);
        sheet.appendRow(HEADERS);
        sheet.setFrozenRows(1);
      } else if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS);
        sheet.setFrozenRows(1);
      }

      sheet.appendRow([
        new Date(),
        safeCell_(name),
        safeCell_(phone),
        safeCell_(service),
        safeCell_(message),
        'Да',
        safeCell_(source)
      ]);
    } finally {
      lock.releaseLock();
    }

    return response_(true);
  } catch (error) {
    console.error('Lead form error: ' + error);
    return response_(false);
  }
}

function clean_(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

// Prevent spreadsheet formula injection from user-supplied text.
function safeCell_(value) {
  const text = String(value || '');
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function response_(ok) {
  const payload = JSON.stringify({ type: 'vector-service-lead', ok: ok });
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>window.parent.postMessage(' + payload + ', "*");</script>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
