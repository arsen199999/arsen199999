import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  cpSync,
  copyFileSync,
  lstatSync,
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
// Explorer and other Windows programs can hold a directory open even when its
// files are writable. Keep existing directories in place and replace their
// contents; never rename a live application directory into the backup folder.
function replaceEntry(source, destination) {
  const sourceInfo = lstatSync(source);
  let destinationInfo;
  try {
    destinationInfo = lstatSync(destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (sourceInfo.isSymbolicLink()) {
    if (destinationInfo) rmSync(destination, { recursive: true, force: true });
    cpSync(source, destination, { verbatimSymlinks: true });
  } else if (sourceInfo.isDirectory()) {
    if (destinationInfo && (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()))
      rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    const names = readdirSync(source);
    for (const name of names) replaceEntry(join(source, name), join(destination, name));
    const expected = new Set(names);
    for (const name of readdirSync(destination)) {
      if (!expected.has(name))
        rmSync(join(destination, name), {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
    }
  } else {
    if (destinationInfo && (destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()))
      rmSync(destination, { recursive: true, force: true });
    copyFileSync(source, destination);
  }
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
  const entries = [...files, 'dist', 'node_modules'].filter((file) =>
    existsSync(join(prepared, file)),
  );
  const originals = new Set();
  const changed = [];
  mkdirSync(join(backupDir, 'code'));
  // Finish every backup before changing any application file.
  for (const file of entries) {
    if (existsSync(join(target, file))) {
      cpSync(join(target, file), join(backupDir, 'code', file), {
        recursive: true,
        verbatimSymlinks: true,
      });
      originals.add(file);
    }
  }
  try {
    for (const file of entries) {
      beforeMove(file);
      // Record before copying, so partial writes are also restored on failure.
      changed.push(file);
      replaceEntry(join(prepared, file), join(target, file));
    }
  } catch (error) {
    const failed = [];
    for (const file of changed.reverse()) {
      try {
        if (originals.has(file)) replaceEntry(join(backupDir, 'code', file), join(target, file));
        else
          rmSync(join(target, file), {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          });
      } catch {
        failed.push(file);
      }
    }
    const reason = ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
      ? 'Windows не разрешила заменить файл. Закройте окна старой CRM и программы, использующие её файлы, затем повторите обновление.'
      : error.message;
    if (failed.length)
      throw new Error(
        `Обновление остановлено. Не удалось автоматически восстановить: ${failed.join(', ')}. Не запускайте CRM до восстановления. Резервная копия: ${backupDir}. ${reason}`,
      );
    throw new Error(`Обновление отменено, предыдущие файлы восстановлены. ${reason}`);
  }
  return backupDir;
}
