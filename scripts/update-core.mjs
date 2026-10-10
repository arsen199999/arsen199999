import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  cpSync,
  renameSync,
  rmSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { parseEnv } from 'node:util';
import net from 'node:net';

// Only application files may be replaced. User databases, .env and backups stay in place.
export const appFiles = [
  'src',
  'server',
  'scripts',
  'public',
  'tests',
  '.gitignore',
  '.gitattributes',
  '.env.example',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'README.md',
  'START-WINDOWS.cmd',
  'UPDATE-WINDOWS.cmd',
  'КАК ЗАПУСТИТЬ.txt',
  'КАК ОБНОВИТЬ.txt',
];
const inside = (parent, child) => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};
export function validateFolders(source, target) {
  source = realpathSync(source);
  target = realpathSync(target);
  if (inside(source, target) || inside(target, source))
    throw new Error('Распакуйте обновление в отдельную папку, вне папки рабочей студии.');
  for (const path of [source, target]) {
    if (
      !existsSync(join(path, 'package.json')) ||
      JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).name !== 'linia-studio-crm'
    )
      throw new Error('Выберите папку CRM, в которой находится START-WINDOWS.cmd.');
  }
  return { source, target };
}
export function databasePaths(target) {
  const envPath = join(target, '.env');
  const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
  const paths = new Set();
  const data = join(target, 'data');
  if (existsSync(data))
    for (const f of readdirSync(data)) {
      const p = join(data, f);
      if (statSync(p).isFile() && /\.(sqlite|sqlite3|db)$/i.test(f)) paths.add(p);
    }
  const configured = process.env.DATABASE_PATH || env.DATABASE_PATH;
  if (configured) {
    const p = resolve(target, configured);
    if (existsSync(p)) paths.add(p);
  }
  return { paths: [...paths], port: Number(process.env.PORT || env.PORT || 3000) };
}
export async function ensureStopped(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Некорректный порт студии. Проверьте .env.');
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(
        new Error(
          `Закройте окно работающей CRM (порт ${port} занят) и запустите обновление ещё раз.`,
        ),
      ),
    );
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
export async function installPreparedUpdate(
  prepared,
  target,
  { files = appFiles, beforeMove = () => {} } = {},
) {
  const { paths } = databasePaths(target);
  const backupDir = join(
    target,
    'update-backups',
    new Date().toISOString().replaceAll(':', '-') + '-' + Math.random().toString(16).slice(2, 8),
  );
  mkdirSync(join(backupDir, 'databases'), { recursive: true });
  const manifest = [];
  for (const [i, path] of paths.entries()) {
    const destination = join(backupDir, 'databases', `${i + 1}.sqlite`);
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      await backup(db, destination);
    } finally {
      db.close();
    }
    const check = new DatabaseSync(destination, { readOnly: true });
    try {
      if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
        throw new Error('Не удалось проверить резервную копию базы. Исходные файлы сохранены.');
    } finally {
      check.close();
    }
    manifest.push({ source: path, backup: destination });
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(backupDir, 'databases.json'), JSON.stringify(manifest, null, 2), {
    mode: 0o600,
  });
  if (existsSync(join(target, '.env'))) cpSync(join(target, '.env'), join(backupDir, '.env'));
  const moved = [],
    installed = [];
  mkdirSync(join(backupDir, 'code'));
  try {
    for (const file of [...files, 'dist', 'node_modules']) {
      if (!existsSync(join(prepared, file))) continue;
      beforeMove(file);
      if (existsSync(join(target, file))) {
        renameSync(join(target, file), join(backupDir, 'code', file));
        moved.push(file);
      }
      renameSync(join(prepared, file), join(target, file));
      installed.push(file);
    }
  } catch (error) {
    for (const file of installed.reverse())
      rmSync(join(target, file), { recursive: true, force: true });
    for (const file of moved.reverse())
      renameSync(join(backupDir, 'code', file), join(target, file));
    throw new Error(`Обновление отменено, предыдущие файлы восстановлены: ${error.message}`);
  }
  return backupDir;
}
