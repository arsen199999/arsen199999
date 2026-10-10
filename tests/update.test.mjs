import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  statSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
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
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src', 'app.js'), root === old ? 'old-source' : 'new-source');
    }
    writeFileSync(join(old, 'src', 'removed.js'), 'restore this');
    writeFileSync(join(next, 'src', 'added.js'), 'new module');
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
    assert.equal(readFileSync(join(old, 'src', 'app.js'), 'utf8'), 'old-source');
    assert.equal(readFileSync(join(old, 'src', 'removed.js'), 'utf8'), 'restore this');
    assert.equal(existsSync(join(old, 'src', 'added.js')), false);
    assert.equal(existsSync(join(old, 'data')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('update keeps application directories in place and leaves the tests folder untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'linia-directory-lock-'));
  const old = join(dir, 'old'),
    next = join(dir, 'next');
  try {
    for (const root of [old, next]) {
      mkdirSync(join(root, 'server'), { recursive: true });
      mkdirSync(join(root, 'tests'));
      writeFileSync(join(root, 'server', 'index.mjs'), root === old ? 'old' : 'new');
      writeFileSync(
        join(root, 'tests', 'existing.txt'),
        root === old ? 'keep tests' : 'not installed',
      );
    }
    writeFileSync(join(old, 'server', 'obsolete.mjs'), 'old module');
    const inode = statSync(join(old, 'server')).ino;
    const backup = await installPreparedUpdate(next, old, {
      beforeMove: (file) => {
        assert.notEqual(file, 'tests', 'updater must not touch the locked tests directory');
      },
    });
    assert.equal(
      statSync(join(old, 'server')).ino,
      inode,
      'existing server directory must not be renamed',
    );
    assert.equal(readFileSync(join(old, 'server', 'index.mjs'), 'utf8'), 'new');
    assert.equal(existsSync(join(old, 'server', 'obsolete.mjs')), false);
    assert.equal(readFileSync(join(old, 'tests', 'existing.txt'), 'utf8'), 'keep tests');
    assert.equal(readFileSync(join(backup, 'code', 'server', 'index.mjs'), 'utf8'), 'old');
    assert.equal(existsSync(join(backup, 'code', 'tests')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'copied dependency links remain valid after the preparation folder is removed',
  { skip: process.platform === 'win32' },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'linia-dependency-links-'));
    const old = join(dir, 'old'),
      next = join(dir, 'next');
    try {
      mkdirSync(old);
      mkdirSync(join(next, 'node_modules', '.bin'), { recursive: true });
      mkdirSync(join(next, 'node_modules', 'tool'));
      writeFileSync(join(next, 'node_modules', 'tool', 'cli.js'), 'tool');
      symlinkSync('../tool/cli.js', join(next, 'node_modules', '.bin', 'tool'));
      await installPreparedUpdate(next, old);
      rmSync(next, { recursive: true });
      assert.equal(
        realpathSync(join(old, 'node_modules', '.bin', 'tool')),
        join(old, 'node_modules', 'tool', 'cli.js'),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
