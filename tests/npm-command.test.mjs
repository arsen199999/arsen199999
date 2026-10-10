import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { npmCommand } from '../scripts/npm-command.mjs';

test('Windows npm invocation uses Node without shell argument concatenation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'linia npm '));
  try {
    const cli = join(dir, 'npm-cli.js');
    writeFileSync(cli, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    const args = ['run', 'argument with spaces', '$not-expanded'];
    const command = npmCommand(args, { platform: 'win32', env: { npm_execpath: cli } });
    assert.equal(command.shell, false);
    const result = spawnSync(command.command, command.args, {
      shell: command.shell,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), args);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows npm is located beside Node or in a PATH installation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'linia-npm-path-'));
  try {
    const bin = join(dir, 'node_modules', 'npm', 'bin');
    mkdirSync(bin, { recursive: true });
    const cli = join(bin, 'npm-cli.js');
    writeFileSync(cli, '');
    assert.equal(
      npmCommand(['ci'], { platform: 'win32', execPath: join(dir, 'node.exe'), env: {} }).args[0],
      cli,
    );
    assert.equal(
      npmCommand(['ci'], {
        platform: 'win32',
        execPath: join(dir, 'elsewhere', 'node.exe'),
        env: { Path: `"${dir}"` },
      }).args[0],
      cli,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
