import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  appFiles,
  validateFolders,
  databasePaths,
  ensureStopped,
  installPreparedUpdate,
} from './update-core.mjs';
const source = resolve(fileURLToPath(new URL('..', import.meta.url)));
let stage;
try {
  let target = process.argv[2];
  if (!target) {
    if (process.platform !== 'win32')
      throw new Error('Укажите путь к существующей студии аргументом команды.');
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-Command',
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description = 'Выберите старую папку CRM, где находятся START-WINDOWS.cmd и папка data'; $picker.ShowNewFolderButton = $false; if ($picker.ShowDialog() -eq 'OK') { [Console]::Write($picker.SelectedPath) }",
      ],
      { encoding: 'utf8' },
    );
    if (result.error || result.status !== 0)
      throw new Error('Не удалось открыть выбор папки. Повторите запуск обновления.');
    target = result.stdout.trim();
    if (!target) {
      console.log('Обновление отменено.');
      process.exit(0);
    }
  }
  target = validateFolders(source, target).target;
  const { port } = databasePaths(target);
  await ensureStopped(port);
  console.log('Рабочая студия:', target);
  console.log(
    'Подготавливаем новую версию. Нужен интернет. Данные студии остаются в прежней папке.',
  );
  stage = mkdtempSync(join(target, '.linia-update-'));
  for (const file of appFiles)
    if (existsSync(join(source, file)))
      cpSync(join(source, file), join(stage, file), { recursive: true });
  for (const args of [
    ['ci', '--include=dev', '--no-audit', '--no-fund'],
    ['run', 'build'],
  ]) {
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: stage,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.error || result.status !== 0)
      throw new Error(
        'Новая версия не подготовлена. Рабочая студия не изменена. Проверьте сообщение выше.',
      );
  }
  await ensureStopped(port);
  const backupDir = await installPreparedUpdate(stage, target);
  console.log('\nОбновление установлено. Резервная копия:', backupDir);
  console.log('Откройте START-WINDOWS.cmd в ПРЕЖНЕЙ папке рабочей студии.');
} catch (error) {
  console.error('\n' + error.message);
  process.exitCode = 1;
} finally {
  if (stage) rmSync(stage, { recursive: true, force: true });
}
