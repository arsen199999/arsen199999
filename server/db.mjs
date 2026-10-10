import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { migrateAnalytics } from './ledger.mjs';

export const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function openDatabase(filename, demo = true) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS instructors (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','trainer')),
      instructor_id INTEGER REFERENCES instructors(id)
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '',
      birthday TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'Студия',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, visits INTEGER NOT NULL CHECK(visits > 0),
      days INTEGER NOT NULL CHECK(days > 0), price INTEGER NOT NULL CHECK(price > 0), color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), plan_id INTEGER NOT NULL REFERENCES plans(id),
      name TEXT NOT NULL, total INTEGER NOT NULL, remaining INTEGER NOT NULL CHECK(remaining >= 0),
      start_date TEXT NOT NULL, end_date TEXT NOT NULL, price INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL,
      instructor_id INTEGER NOT NULL REFERENCES instructors(id), date TEXT NOT NULL, time TEXT NOT NULL,
      duration INTEGER NOT NULL CHECK(duration > 0), capacity INTEGER NOT NULL CHECK(capacity > 0),
      room TEXT NOT NULL DEFAULT 'Основной зал', status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled'))
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), client_id INTEGER NOT NULL REFERENCES clients(id),
      membership_id INTEGER NOT NULL REFERENCES memberships(id),
      status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','attended','cancelled')), created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_booking ON bookings(class_id, client_id) WHERE status != 'cancelled';
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), membership_id INTEGER NOT NULL REFERENCES memberships(id),
      amount INTEGER NOT NULL CHECK(amount > 0), method TEXT NOT NULL CHECK(method IN ('card','cash','transfer')),
      description TEXT NOT NULL, date TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS classes_date ON classes(date);
    CREATE INDEX IF NOT EXISTS bookings_membership ON bookings(membership_id, status);
    CREATE INDEX IF NOT EXISTS payments_date ON payments(date);
  `);
  const wasInitialized = Boolean(
    db.prepare("SELECT 1 FROM settings WHERE key = 'initialized'").get(),
  );
  if (!wasInitialized) {
    transaction(db, () => {
      const insert = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries({
        initialized: '1',
        demo: demo ? '1' : '0',
        studio_name: 'Линия',
        subtitle: 'Студия растяжки',
        address: '',
        phone: '',
        monthly_goal: '150000',
      }))
        insert.run(key, value);
      const plan = db.prepare(
        'INSERT INTO plans(name, visits, days, price, color) VALUES (?, ?, ?, ?, ?)',
      );
      plan.run('Пробное занятие', 1, 14, 700, 'peach');
      plan.run('Лёгкий старт', 4, 30, 4200, 'green');
      plan.run('В своём ритме', 8, 30, 7200, 'purple');
      plan.run('Больше движения', 12, 45, 9600, 'pink');
      if (demo) seedDemo(db);
    });
  }
  if (!db.prepare("SELECT 1 FROM settings WHERE key='analytics_schema'").get()) {
    if (wasInitialized && filename !== ':memory:') {
      const backupDir = join(dirname(resolve(filename)), 'backups');
      mkdirSync(backupDir, { recursive: true });
      const backup = join(
        backupDir,
        `before-analytics-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
      );
      db.prepare('VACUUM INTO ?').run(backup);
      chmodSync(backup, 0o600);
      console.log('Создана резервная копия базы перед обновлением аналитики:', backup);
    }
    transaction(db, () => migrateAnalytics(db));
  }
  return db;
}

function seedDemo(db) {
  const date = today();
  const trainer = db.prepare('INSERT INTO instructors(name, specialty, color) VALUES (?, ?, ?)');
  trainer.run('Анна Миронова', 'Растяжка · здоровая спина', 'purple');
  trainer.run('Мария Волкова', 'Пилатес · мягкая растяжка', 'green');
  trainer.run('София Лебедева', 'Шпагат · стретчинг', 'peach');
  const user = db.prepare(
    'INSERT INTO users(name, email, password_hash, role, instructor_id) VALUES (?, ?, ?, ?, ?)',
  );
  user.run(
    'Александра',
    'owner@demo.local',
    hashPassword(randomBytes(24).toString('hex')),
    'owner',
    null,
  );
  user.run(
    'Дарья',
    'admin@demo.local',
    hashPassword(randomBytes(24).toString('hex')),
    'admin',
    null,
  );
  user.run(
    'Анна Миронова',
    'trainer@demo.local',
    hashPassword(randomBytes(24).toString('hex')),
    'trainer',
    1,
  );
  const names = [
    'Анастасия Соколова',
    'Екатерина Смирнова',
    'Дарья Козлова',
    'Полина Новикова',
    'Виктория Морозова',
    'Алина Петрова',
    'Ксения Васильева',
    'Елизавета Попова',
    'Мария Фёдорова',
    'Софья Михайлова',
    'Арина Павлова',
    'Вероника Орлова',
    'Валерия Белова',
    'Ульяна Алексеева',
    'Ева Захарова',
    'Ольга Андреева',
    'Юлия Макарова',
    'Наталья Никитина',
    'Татьяна Зайцева',
    'Елена Кузнецова',
    'Ирина Романова',
    'Диана Сергеева',
    'Александра Иванова',
    'Милана Крылова',
  ];
  const client = db.prepare(
    'INSERT INTO clients(name, phone, email, birthday, notes, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const member = db.prepare(
    'INSERT INTO memberships(client_id, plan_id, name, total, remaining, start_date, end_date, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const payment = db.prepare(
    'INSERT INTO payments(client_id, membership_id, amount, method, description, date, created_by) VALUES (?, ?, ?, ?, ?, ?, 2)',
  );
  const plans = db.prepare('SELECT * FROM plans').all();
  for (let i = 0; i < names.length; i++) {
    const created = shiftDate(date, -(i * 2 + 1));
    client.run(
      names[i],
      `+7900000${String(1000 + i)}`,
      '',
      '',
      i === 0 ? 'Предпочитает вечерние занятия. Первое занятие — мягкая растяжка.' : '',
      ['Рекомендация', 'Соцсети', 'Сайт', 'Студия'][i % 4],
      created,
    );
    if (i < 21) {
      const p = plans[(i % 3) + 1];
      const start = i < 4 ? shiftDate(date, -26 + i) : shiftDate(date, -(i % 8));
      const result = member.run(
        i + 1,
        p.id,
        p.name,
        p.visits,
        p.visits,
        start,
        shiftDate(start, p.days - 1),
        p.price,
      );
      payment.run(
        i + 1,
        result.lastInsertRowid,
        p.price,
        ['card', 'transfer', 'cash'][i % 3],
        p.name,
        `${start}T10:00:00.000Z`,
      );
    }
  }
  const klass = db.prepare(
    'INSERT INTO classes(title, type, instructor_id, date, time, duration, capacity) VALUES (?, ?, ?, ?, ?, 55, ?)',
  );
  const booking = db.prepare(
    'INSERT INTO bookings(class_id, client_id, membership_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const titles = [
    ['Мягкая растяжка', 'soft', 2, '09:00', 8],
    ['Здоровая спина', 'back', 1, '10:30', 10],
    ['Пилатес', 'pilates', 2, '12:00', 8],
    ['Продольный шпагат', 'split', 3, '17:00', 8],
    ['Stretching full body', 'stretch', 1, '18:30', 10],
    ['Вечерняя растяжка', 'soft', 3, '20:00', 8],
  ];
  for (let day = -6; day <= 6; day++) {
    const classDate = shiftDate(date, day);
    const list = day === 0 ? titles : [titles[(day + 6) % 3], titles[3 + ((day + 6) % 3)]];
    for (let j = 0; j < list.length; j++) {
      const [title, type, instructor, time, capacity] = list[j];
      const classId = Number(
        klass.run(title, type, instructor, classDate, time, capacity).lastInsertRowid,
      );
      const count = day > 0 ? 2 : day === 0 ? [5, 7, 4, 6, 8, 3][j] : 3;
      let added = 0;
      const memberships = db
        .prepare('SELECT * FROM memberships WHERE start_date <= ? AND end_date >= ?')
        .all(classDate, classDate);
      for (const m of memberships
        .slice((j + day + 7) % 5)
        .concat(memberships.slice(0, (j + day + 7) % 5))) {
        if (added >= count) break;
        const held = db
          .prepare(
            "SELECT count(*) AS n FROM bookings WHERE membership_id = ? AND status = 'booked'",
          )
          .get(m.id).n;
        const available = db
          .prepare('SELECT remaining FROM memberships WHERE id = ?')
          .get(m.id).remaining;
        if (available <= held) continue;
        const status = day < 0 ? 'attended' : 'booked';
        booking.run(classId, m.client_id, m.id, status, new Date().toISOString());
        if (status === 'attended')
          db.prepare('UPDATE memberships SET remaining = remaining - 1 WHERE id = ?').run(m.id);
        added++;
      }
    }
  }
}
