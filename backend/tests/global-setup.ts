import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'mysql://checkin:checkinpass@127.0.0.1:3307/checkin_test';

/**
 * Apply Prisma migrations to the dedicated test database before the suite runs.
 * The database itself must exist (docker-compose MySQL + CREATE DATABASE).
 */
export default async function globalSetup(): Promise<void> {
  const cwd = process.cwd();
  const prismaCli = path.join(cwd, 'node_modules', 'prisma', 'build', 'index.js');

  if (!fs.existsSync(prismaCli)) {
    throw new Error(`Prisma CLI not found at ${prismaCli}; run npm install first`);
  }

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
