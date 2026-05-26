import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const bugLogPath = path.resolve(process.env.CHATON_BUG_LOG_PATH ?? path.join(repoRoot, 'qa', 'ui-bug-log.csv'));
const selfTest = process.env.CHATON_BUG_LOG_SMOKE_SELF_TEST?.trim() || null;

const expectedHeader = [
  'id',
  'detected_at',
  'status',
  'severity',
  'area',
  'feature',
  'summary',
  'steps_to_reproduce',
  'expected_result',
  'actual_result',
  'console_errors',
  'url',
  'app_state',
  'notes',
];
const knownStatuses = new Set(['open', 'fixed', 'investigating', 'wontfix']);
const knownSeverities = new Set(['blocker', 'high', 'medium', 'low']);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (quoted) {
    throw new Error('CSV has an unterminated quoted field');
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.length > 0));
}

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toRecord(header, cells) {
  return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? '']));
}

function validateBugLogText(text) {
  const rows = parseCsv(text);
  requireCondition(rows.length >= 2, 'Bug log must contain a header and at least one bug row');

  const [header, ...dataRows] = rows;
  requireCondition(JSON.stringify(header) === JSON.stringify(expectedHeader), `Unexpected bug log header: ${header.join(',')}`);

  const seenIds = new Set();
  const records = dataRows.map((cells, rowIndex) => {
    const line = rowIndex + 2;
    requireCondition(cells.length === header.length, `Line ${line} has ${cells.length} columns, expected ${header.length}`);
    const record = toRecord(header, cells);
    requireCondition(/^BUG-\d{4}$/.test(record.id), `Line ${line} has invalid id: ${record.id}`);
    requireCondition(!seenIds.has(record.id), `Duplicate bug id: ${record.id}`);
    seenIds.add(record.id);
    requireCondition(!Number.isNaN(Date.parse(record.detected_at)), `Line ${line} has invalid detected_at: ${record.detected_at}`);
    requireCondition(knownStatuses.has(record.status), `Line ${line} has unknown status: ${record.status}`);
    requireCondition(knownSeverities.has(record.severity), `Line ${line} has unknown severity: ${record.severity}`);
    for (const field of ['area', 'feature', 'summary', 'steps_to_reproduce', 'expected_result', 'actual_result', 'app_state', 'notes']) {
      requireCondition(record[field].trim().length > 0, `Line ${line} has empty ${field}`);
    }
    return record;
  });

  const numericIds = records.map((record) => Number(record.id.slice('BUG-'.length))).sort((a, b) => a - b);
  for (const [index, id] of numericIds.entries()) {
    requireCondition(id === index + 1, `Bug ids must be sequential; expected BUG-${String(index + 1).padStart(4, '0')} but saw BUG-${String(id).padStart(4, '0')}`);
  }

  const byStatus = Object.fromEntries([...knownStatuses].map((status) => [status, 0]));
  const bySeverity = Object.fromEntries([...knownSeverities].map((severity) => [severity, 0]));
  for (const record of records) {
    byStatus[record.status] += 1;
    bySeverity[record.severity] += 1;
  }
  return { records, byStatus, bySeverity };
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`bug-log-smoke self-test failed: ${message}`);
  }
}

function row(values) {
  return values.map((value) => {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',');
}

function makeBugRow(id, overrides = {}) {
  const record = {
    id,
    detected_at: '2026-05-26T16:30:00+02:00',
    status: 'fixed',
    severity: 'medium',
    area: 'release-qa',
    feature: 'fixture',
    summary: 'Summary with comma, quote " and newline\ninside',
    steps_to_reproduce: '1. Do the thing 2. Observe behavior',
    expected_result: 'Expected result',
    actual_result: 'Actual result',
    console_errors: 'none',
    url: 'n/a',
    app_state: 'fixture state',
    notes: 'fixture notes',
    ...overrides,
  };
  return row(expectedHeader.map((field) => record[field]));
}

function runFixtureSelfTest() {
  const validText = `${row(expectedHeader)}\n${makeBugRow('BUG-0001', { severity: 'blocker' })}\n${makeBugRow('BUG-0002', { status: 'open', severity: 'high' })}\n`;
  const valid = validateBugLogText(validText);
  assertSelfTest(valid.records.length === 2, `expected 2 records, got ${valid.records.length}`);
  assertSelfTest(valid.records[0].summary.includes('quote " and newline\ninside'), 'quoted comma/quote/newline field was not parsed');
  assertSelfTest(valid.byStatus.fixed === 1 && valid.byStatus.open === 1, 'status counts are wrong');
  assertSelfTest(valid.bySeverity.blocker === 1 && valid.bySeverity.high === 1, 'severity counts are wrong');

  const cases = [
    ['duplicate id', `${row(expectedHeader)}\n${makeBugRow('BUG-0001')}\n${makeBugRow('BUG-0001')}\n`],
    ['id gap', `${row(expectedHeader)}\n${makeBugRow('BUG-0001')}\n${makeBugRow('BUG-0003')}\n`],
    ['bad status', `${row(expectedHeader)}\n${makeBugRow('BUG-0001', { status: 'done' })}\n`],
    ['bad severity', `${row(expectedHeader)}\n${makeBugRow('BUG-0001', { severity: 'critical' })}\n`],
    ['unterminated quote', `${row(expectedHeader)}\n"BUG-0001`],
  ];
  for (const [name, text] of cases) {
    let failed = false;
    try {
      validateBugLogText(text);
    } catch {
      failed = true;
    }
    assertSelfTest(failed, `${name} fixture should fail`);
  }

  console.log(JSON.stringify({ ok: true, selfTest: 'fixtures', rows: valid.records.length }, null, 2));
}

if (selfTest === 'fixtures') {
  runFixtureSelfTest();
  process.exit(0);
}

if (selfTest) {
  throw new Error(`Unknown bug log smoke self-test: ${selfTest}`);
}

if (!fs.existsSync(bugLogPath)) {
  throw new Error(`Bug log not found: ${bugLogPath}`);
}

const { records, byStatus, bySeverity } = validateBugLogText(fs.readFileSync(bugLogPath, 'utf8'));

console.log(JSON.stringify({
  ok: true,
  bugLogPath,
  rows: records.length,
  firstId: records[0]?.id ?? null,
  lastId: records.at(-1)?.id ?? null,
  byStatus,
  bySeverity,
}, null, 2));
