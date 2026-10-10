import { DatabaseSync, backup } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(process.env.DATABASE_PATH || './data/studio.sqlite');
if (!existsSync(source)) throw new Error('Database does not exist. Start the studio first.');
const destination = resolve(
  process.argv[2] ||
    `./data/backups/studio-${new Date().toISOString().replaceAll(':', '-')}.sqlite`,
);
if (existsSync(destination))
  throw new Error('Backup destination already exists; choose a new filename.');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  chmodSync(destination, 0o600);
  const check = new DatabaseSync(destination, { readOnly: true });
  try {
    if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('Backup integrity check failed.');
  } finally {
    check.close();
  }
  console.log(`Verified SQLite backup saved: ${destination}`);
} finally {
  db.close();
}
