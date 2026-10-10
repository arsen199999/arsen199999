import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { installPreparedUpdate, validateFolders } from '../scripts/update-core.mjs';
test('prepared update retains data and .env, backs up database, and replaces stale build', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'linia-update-')),
    old = join(dir, 'old'),
    next = join(dir, 'next');
  try {
    for (const root of [old, next]) {
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'linia-studio-crm' }));
    }
    mkdirSync(join(old, 'data'));
    const path = join(old, 'data', 'live.sqlite');
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE clients(name TEXT);INSERT INTO clients VALUES ('Настоящий клиент');");
    db.close();
    writeFileSync(join(old, '.env'), 'DATABASE_PATH=./data/live.sqlite\nDEMO_MODE=0\n');
    writeFileSync(join(old, 'dist', 'index.html'), 'old');
    writeFileSync(join(next, 'dist', 'index.html'), 'new');
    assert.equal(validateFolders(next, old).target, old);
    assert.throws(() => validateFolders(old, old));
    const backup = await installPreparedUpdate(next, old);
    assert.equal(readFileSync(join(old, 'dist', 'index.html'), 'utf8'), 'new');
    assert.equal(readFileSync(join(backup, 'code', 'dist', 'index.html'), 'utf8'), 'old');
    assert.equal(
      readFileSync(join(old, '.env'), 'utf8'),
      'DATABASE_PATH=./data/live.sqlite\nDEMO_MODE=0\n',
    );
    const manifest = JSON.parse(readFileSync(join(backup, 'databases.json'), 'utf8'));
    assert.equal(manifest.length, 1);
    for (const p of [path, manifest[0].backup]) {
      const copy = new DatabaseSync(p);
      assert.equal(copy.prepare('SELECT name FROM clients').get().name, 'Настоящий клиент');
      copy.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('failed file replacement restores old code and leaves database untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'linia-rollback-')),
    old = join(dir, 'old'),
    next = join(dir, 'next');
  try {
    for (const root of [old, next]) {
      mkdirSync(root);
      writeFileSync(join(root, 'package.json'), root === old ? 'old' : 'new');
      writeFileSync(join(root, 'index.html'), root === old ? 'old-index' : 'new-index');
    }
    await assert.rejects(
      installPreparedUpdate(next, old, {
        beforeMove: (file) => {
          if (file === 'index.html') throw new Error('Simulated lock');
        },
      }),
      /предыдущие файлы восстановлены/,
    );
    assert.equal(readFileSync(join(old, 'package.json'), 'utf8'), 'old');
    assert.equal(readFileSync(join(old, 'index.html'), 'utf8'), 'old-index');
    assert.equal(existsSync(join(old, 'data')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
