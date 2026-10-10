import { openDatabase } from './db.mjs';
import { createApp } from './app.mjs';

const db = openDatabase(
  process.env.DATABASE_PATH || './data/studio.sqlite',
  process.env.DEMO_MODE !== '0',
);
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const app = createApp(db, { secureCookie: process.env.COOKIE_SECURE === '1' });
const server = app.listen(port, host, () => {
  console.log(`Линия CRM: ${host}:${port}`);
  if (process.send) process.send({ type: 'ready', port: server.address().port });
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
