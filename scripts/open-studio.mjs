import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The Windows launcher starts the same server as npm start. IPC opens the
// browser only after this server has actually bound its port.
const root = fileURLToPath(new URL('../', import.meta.url));
const server = fork(fileURLToPath(new URL('../server/index.mjs', import.meta.url)), [], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1' },
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});

server.on('message', (message) => {
  if (message?.type !== 'ready') return;
  const port = Number(message.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  const address = `http://127.0.0.1:${port}`;
  console.log('\nCRM готова. Оставьте это окно открытым во время работы.');
  if (process.env.LINIA_NO_BROWSER === '1') return;
  let opener;
  if (process.platform === 'win32') {
    opener = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', address], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else if (process.platform === 'darwin') {
    opener = spawn('open', [address], { stdio: 'ignore' });
  } else {
    opener = spawn('xdg-open', [address], { stdio: 'ignore' });
  }
  opener.on('error', () =>
    console.log(`Откройте браузер на этом компьютере и введите адрес: ${address}`),
  );
  opener.unref();
});

server.on('error', (error) => {
  console.error('Не удалось запустить CRM:', error.message);
  process.exitCode = 1;
});
server.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
