#!/usr/bin/env node
/**
 * Playwright UI smoke test + screenshots for the Next.js app.
 *
 * Prereqs:
 *   - docker compose stack running (API at http://localhost:3001/api, human face provider)
 *   - admin dev/prod server at http://localhost:3000 (or ADMIN_URL)
 *   - qa/fixtures/face-camera.y4m (node qa/make-fake-camera.mjs)
 *
 * Run: node qa/ui-check.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:3000').replace(/\/$/, '');
const SHOTS = path.join(__dirname, 'screenshots');
const Y4M = process.env.FACE_VIDEO || path.join(__dirname, 'fixtures', 'face-camera-amy1.y4m');
const STUDENT_ID = `UI${Date.now().toString().slice(-7)}`;
const PASSWORD = 'Student@12345';
const results = [];
const consoleErrors = [];

fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(Y4M)) throw new Error(`missing ${Y4M}; run: node qa/make-fake-camera.mjs`);

const pass = (name, detail = '') => { results.push({ name, ok: true, detail }); console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); };
const fail = (name, detail = '') => { results.push({ name, ok: false, detail }); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); };
const step = (name) => console.log(`\n== ${name} ==`);

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
  console.log(`  shot  ${name}.png`);
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${Y4M}`,
    '--no-sandbox',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  permissions: ['camera'],
  baseURL: ADMIN_URL,
});
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('response', (response) => {
  if (response.status() >= 500) consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
});

try {
  step('Login');
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill('admin@school.edu');
  await page.locator('#password').fill('Admin@12345');
  await shot(page, '01-login');
  await page.getByRole('button', { name: /sign in to console/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  pass('admin login', page.url());
  await shot(page, '02-dashboard');

  step('Admin pages');
  const pages = [
    ['/students', '03-students'],
    ['/attendance', '04-attendance'],
    ['/reports', '05-reports'],
    ['/devices', '06-devices'],
    ['/settings', '07-settings'],
  ];
  for (const [route, name] of pages) {
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    if (response && response.ok()) pass(`${route} renders`, String(response.status()));
    else fail(`${route} renders`, String(response?.status()));
    await page.waitForTimeout(400);
    await shot(page, name);
  }

  step('Student self-registration with webcam');
  await page.goto('/register', { waitUntil: 'networkidle' });
  await page.locator('#reg-studentId').fill(STUDENT_ID);
  await page.locator('#reg-firstName').fill('Webcam');
  await page.locator('#reg-lastName').fill('Tester');
  await page.locator('#reg-dob').fill('2011-06-15');
  await page.locator('#reg-class').fill('7A');
  await page.locator('#reg-form').fill('Form 2');
  await page.locator('#reg-password').fill(PASSWORD);
  await page.locator('#reg-confirmPassword').fill(PASSWORD);
  await page.getByRole('button', { name: /continue to face photo/i }).click();

  await page.getByRole('button', { name: /enable camera/i }).click();
  const capture = page.getByRole('button', { name: /capture photo/i });
  await capture.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1200); // let the fake camera produce a frame
  await shot(page, '08-register-camera');
  await capture.click();
  await page.getByText(/photo captured/i).waitFor({ state: 'visible', timeout: 20_000 });
  pass('webcam capture');
  await page.locator('#reg-consent').check({ force: true });
  await shot(page, '09-register-captured');
  await page.getByRole('button', { name: /complete registration/i }).click();
  await page.getByText(/you.re registered/i).waitFor({ state: 'visible', timeout: 90_000 });
  pass('student registration', STUDENT_ID);
  await shot(page, '10-register-success');

  step('Responsive check');
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto('/login', { waitUntil: 'networkidle' });
  await shot(mobile, '11-login-mobile');
  await mobile.goto('/register', { waitUntil: 'networkidle' });
  await shot(mobile, '12-register-mobile');
  await mobile.close();

  step('Console');
  const relevant = consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  if (relevant.length === 0) pass('no console/HTTP errors');
  else fail('no console/HTTP errors', relevant.slice(0, 8).join(' | '));
} catch (error) {
  console.error(`\nUI CHECK ABORTED: ${error.message}`);
  await shot(page, 'error-state').catch(() => {});
  results.push({ name: 'script', ok: false, detail: error.message });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`);
console.log(`Screenshots: ${SHOTS}`);
if (failed.length) {
  console.log('Failures:');
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}
