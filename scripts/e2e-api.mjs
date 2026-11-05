#!/usr/bin/env node
/**
 * End-to-end API test against a running stack with FACE_PROVIDER=human.
 *
 *   node scripts/e2e-api.mjs
 *   API_URL=http://localhost:3001/api node scripts/e2e-api.mjs
 *
 * It uses three test face images from the face-api.js examples (downloaded on demand
 * to qa/fixtures, which is gitignored). Do not run this against production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const API = (process.env.API_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const FIXTURES = path.join(root, 'qa', 'fixtures');
const FACE_BASE = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/examples/images';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@school.edu', password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345' };
const STUDENT_ID = process.env.E2E_STUDENT_ID || `E2E${Date.now().toString().slice(-7)}`;
const RESULTS = [];

const log = (msg) => console.log(msg);
const pass = (name, detail = '') => { RESULTS.push({ name, ok: true, detail }); log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); };
const fail = (name, detail = '') => { RESULTS.push({ name, ok: false, detail }); log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); };
const section = (name) => log(`\n== ${name} ==`);

async function ensureFixtures() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const wanted = {
    'amy1.png': `${FACE_BASE}/amy/amy1.png`,
    'amy2.png': `${FACE_BASE}/amy/amy2.png`,
    'penny1.png': `${FACE_BASE}/penny/penny1.png`,
  };
  for (const [name, url] of Object.entries(wanted)) {
    const target = path.join(FIXTURES, name);
    if (fs.existsSync(target) && fs.statSync(target).size > 1000) continue;
    log(`  downloading test fixture ${name} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download fixture ${name}: HTTP ${res.status}`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  }
  return {
    enroll: path.join(FIXTURES, 'amy1.png'),
    same: path.join(FIXTURES, 'amy2.png'),
    other: path.join(FIXTURES, 'penny1.png'),
  };
}

function fileBlob(file, type = 'image/png') {
  return new Blob([fs.readFileSync(file)], { type });
}

async function api(pathname, { method = 'GET', token, deviceKey, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (deviceKey) h['X-Device-Key'] = deviceKey;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${API}${pathname}`, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, headers: res.headers, text };
}

async function adminLogin() {
  const { status, json } = await api('/auth/admin/login', { method: 'POST', body: ADMIN });
  if (status !== 200 || !json?.data?.token) throw new Error(`admin login failed: ${status} ${JSON.stringify(json)}`);
  pass('admin login', `role=${json.data.user?.role}`);
  return json.data.token;
}

async function registerStudent(fixtures) {
  const form = new FormData();
  form.set('studentId', STUDENT_ID);
  form.set('firstName', 'E2E');
  form.set('lastName', 'Pupil');
  form.set('dob', '2011-06-15');
  form.set('sex', 'FEMALE');
  form.set('class', '7A');
  form.set('form', 'Form 2');
  form.set('password', 'Student@12345');
  form.set('faceImage', fileBlob(fixtures.enroll), 'enroll.png');
  const { status, json } = await api('/auth/student/register', { method: 'POST', form });
  if (status !== 201 || !json?.data?.token) throw new Error(`student register failed: ${status} ${JSON.stringify(json).slice(0, 800)}`);
  pass('student registration + face enrollment', `studentId=${STUDENT_ID}`);
  return json.data.token;
}

async function kioskVerify(deviceKey, image, mode = 'AUTO') {
  const form = new FormData();
  form.set('image', fileBlob(image), 'scan.png');
  form.set('mode', mode);
  return api('/kiosk/verify', { method: 'POST', deviceKey, form });
}

async function main() {
  log(`E2E API test\nAPI: ${API}\nStudent: ${STUDENT_ID}`);
  const fixtures = await ensureFixtures();

  section('Auth');
  const adminToken = await adminLogin();
  const health = await api('/health');
  if (health.status === 200 && health.json?.data?.status === 'ok') pass('health', `faceService=${health.json.data.faceService}`);
  else fail('health', `${health.status} ${health.text.slice(0, 200)}`);

  section('Student self-registration');
  const studentToken = await registerStudent(fixtures);
  const studentLogin = await api('/auth/student/login', { method: 'POST', body: { studentId: STUDENT_ID, password: 'Student@12345' } });
  if (studentLogin.status === 200 && studentLogin.json?.data?.token) pass('student login'); else fail('student login', `${studentLogin.status}`);
  const profile = await api('/student/profile', { token: studentToken });
  if (profile.status === 200 && profile.json?.data?.studentId === STUDENT_ID) pass('student profile'); else fail('student profile', `${profile.status}`);

  section('Kiosk check-in');
  const devices = await api('/devices', { token: adminToken });
  const device = devices.json?.data?.items?.[0] || devices.json?.data?.[0];
  if (devices.status !== 200 || !device) throw new Error(`no seeded device found: ${devices.status} ${devices.text.slice(0, 300)}`);
  pass('devices list', `${device.name}`);
  const deviceKey = process.env.SEED_DEVICE_KEY || 'demo-kiosk-key-12345';
  const healthKiosk = await api('/kiosk/health', { deviceKey });
  if (healthKiosk.status === 200) pass('kiosk health', `faceServiceReady=${healthKiosk.json?.data?.faceServiceReady}`);
  else fail('kiosk health', `${healthKiosk.status} ${healthKiosk.text.slice(0, 200)}`);

  const first = await kioskVerify(deviceKey, fixtures.enroll);
  const firstData = first.json?.data;
  if (first.status === 200 && firstData?.matched === true && firstData?.student?.studentId === STUDENT_ID) {
    pass('face match on check-in', `action=${firstData.action} confidence=${firstData.confidence?.toFixed?.(4)}`);
    if (['CHECK_IN', 'ALREADY_CHECKED_IN'].includes(firstData.action)) pass('check-in action'); else fail('check-in action', firstData.action);
    if (firstData.attendance?.status === 'PRESENT' || firstData.attendance?.status === 'LATE') pass('attendance status', firstData.attendance.status);
    else fail('attendance status', JSON.stringify(firstData.attendance));
  } else {
    fail('face match on check-in', `${first.status} ${JSON.stringify(firstData || first.json).slice(0, 700)}`);
  }

  const second = await kioskVerify(deviceKey, fixtures.same);
  const secondData = second.json?.data;
  if (secondData?.matched === true && secondData?.student?.studentId === STUDENT_ID) {
    pass('same-person second frame matches', `action=${secondData.action} confidence=${secondData.confidence?.toFixed?.(4)}`);
  } else {
    fail('same-person second frame matches', JSON.stringify(secondData || second.json).slice(0, 500));
  }

  const impostor = await kioskVerify(deviceKey, fixtures.other);
  if (impostor.status === 200 && impostor.json?.data?.matched === false) pass('different person rejected', `reason=${impostor.json.data.reason}`);
  else fail('different person rejected', `${impostor.status} ${impostor.text.slice(0, 400)}`);

  section('Check-out flow');
  const att = await api(`/attendance?studentId=${encodeURIComponent(STUDENT_ID)}&date=${today()}`, { token: adminToken });
  const row = att.json?.data?.items?.[0];
  if (!row) throw new Error(`attendance row not found: ${att.status} ${att.text.slice(0, 500)}`);
  const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const corrected = await api(`/attendance/${row.id}`, { method: 'PATCH', token: adminToken, body: { checkInAt: past } });
  if (corrected.status === 200) pass('manual check-in time correction'); else fail('manual check-in time correction', `${corrected.status}`);
  const out = await kioskVerify(deviceKey, fixtures.enroll);
  if (out.json?.data?.action === 'CHECK_OUT' && out.json?.data?.attendance?.checkOutAt) pass('check-out on next scan', out.json.data.attendance.checkOutAt);
  else fail('check-out on next scan', JSON.stringify(out.json?.data || out.json).slice(0, 600));
  const third = await kioskVerify(deviceKey, fixtures.enroll);
  if (third.json?.data?.action === 'ALREADY_CHECKED_OUT') pass('repeat scan after checkout guarded'); else fail('repeat scan after checkout guarded', JSON.stringify(third.json?.data).slice(0, 300));

  section('Admin reporting');
  const list = await api('/students?search=E2E', { token: adminToken });
  if (list.status === 200 && list.json?.data?.items?.some((s) => s.studentId === STUDENT_ID)) pass('student visible to admin'); else fail('student visible to admin', `${list.status}`);
  const attendance = await api(`/attendance?date=${today()}&studentId=${encodeURIComponent(STUDENT_ID)}`, { token: adminToken });
  if (attendance.status === 200) pass('attendance list', `total=${attendance.json?.data?.total ?? attendance.json?.data?.items?.length}`);
  else fail('attendance list', `${attendance.status}`);
  const absentees = await api(`/attendance?date=${today()}&status=ABSENT`, { token: adminToken });
  if (absentees.status === 200) pass('absentees query'); else fail('absentees query', `${absentees.status}`);
  const csv = await api(`/attendance/export?from=${today()}&to=${today()}`, { token: adminToken });
  if (csv.status === 200 && csv.headers.get('content-type')?.includes('text/csv') && csv.text.includes('student_id')) pass('CSV export', `${csv.text.split('\n').length - 1} rows`);
  else fail('CSV export', `${csv.status} ${csv.headers.get('content-type')}`);
  const report = await api(`/reports/summary?from=${dayOffset(-6)}&to=${today()}`, { token: adminToken });
  if (report.status === 200 && report.json?.data?.totals) pass('reports summary'); else fail('reports summary', `${report.status} ${report.text.slice(0, 300)}`);
  const dashboard = await api(`/dashboard?date=${today()}`, { token: adminToken });
  if (dashboard.status === 200 && dashboard.json?.data?.stats) pass('dashboard'); else fail('dashboard', `${dashboard.status}`);

  section('Cleanup');
  const deactivate = await api(`/students/${encodeURIComponent(STUDENT_ID)}`, { method: 'DELETE', token: adminToken });
  if (deactivate.status === 200) pass('test student deactivated'); else fail('test student deactivated', `${deactivate.status}`);

  const failed = RESULTS.filter((r) => !r.ok);
  log(`\n${RESULTS.length - failed.length}/${RESULTS.length} checks passed`);
  if (failed.length) {
    log('Failures:');
    failed.forEach((f) => log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function dayOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

main().catch((err) => {
  console.error('\nE2E ABORTED:', err.message);
  process.exit(1);
});
