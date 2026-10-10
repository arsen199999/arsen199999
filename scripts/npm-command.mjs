import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// Run npm's JS entry point directly on Windows. Passing arguments to npm.cmd
// through a shell produces DEP0190 on recent Node versions.
export function npmCommand(
  args,
  { platform = process.platform, execPath = process.execPath, env = process.env } = {},
) {
  if (platform !== 'win32') return { command: 'npm', args, shell: false };
  const path = env.PATH || env.Path || env.path || '';
  const candidates = [
    env.npm_execpath,
    ...[dirname(execPath), ...path.split(';').filter(Boolean)].map((directory) =>
      join(directory.replace(/^"|"$/g, ''), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ),
  ];
  const cli = candidates.find(
    (file) => file && basename(file) === 'npm-cli.js' && existsSync(file),
  );
  if (!cli)
    throw new Error(
      'Не найден npm для Node.js. Переустановите Node.js 24 или новее с официального сайта nodejs.org и повторите обновление.',
    );
  return { command: execPath, args: [cli, ...args], shell: false };
}
