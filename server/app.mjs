import express from 'express';
import { readReceipts, readSales, addSale } from './ledger.mjs';
import { registerReports } from './report-routes.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkPassword, hashPassword, today, shiftDate, transaction } from './db.mjs';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status = 400) => {
  throw new HttpError(status, message);
};
const required = (value, label, max = 150) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail(`${label}: заполните поле (до ${max} символов).`);
  return value.trim();
};
const optional = (value, max = 2000) => {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > max) fail('Слишком длинное значение поля.');
  return value.trim();
};
const integer = (value, label, min = 1, max = 1000000) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    fail(`${label}: допустимо число от ${min} до ${max}.`);
  return n;
};
const validDate = (date) => {
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    fail('Укажите корректную дату.');
  return date;
};
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  instructor_id: u.instructor_id,
});
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function createApp(db, { staticDir = resolve('dist'), secureCookie = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (
        req.get('sec-fetch-site') === 'cross-site' ||
        (origin && new URL(origin).host !== req.get('host'))
      )
        return res.status(403).json({ error: 'Запрос с другого сайта запрещён.' });
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  const isDemo = () =>
    db.prepare("SELECT value FROM settings WHERE key = 'demo'").get()?.value === '1';
  const cookieName = 'linia_session';
  function createSession(res, user) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO auth_sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      tokenHash(token),
      user.id,
      Date.now() + 1000 * 60 * 60 * 12,
    );
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookie,
      maxAge: 1000 * 60 * 60 * 12,
      path: '/',
    });
    return publicUser(user);
  }
  const loginAttempts = new Map();
  function limitLogin(req) {
    const now = Date.now();
    for (const [key, attempt] of loginAttempts) if (attempt.until <= now) loginAttempts.delete(key);
    const key = req.ip;
    const value = loginAttempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    value.count++;
    loginAttempts.set(key, value);
    if (value.count > 20) fail('Слишком много попыток входа. Попробуйте через 15 минут.', 429);
  }
  app.get('/api/auth/status', (_req, res) =>
    res.json({
      demo: isDemo(),
      needsSetup: !db.prepare('SELECT 1 FROM users LIMIT 1').get(),
      studioName: db.prepare("SELECT value FROM settings WHERE key = 'studio_name'").get().value,
    }),
  );
  app.post('/api/auth/setup', (req, res) => {
    if (db.prepare('SELECT 1 FROM users LIMIT 1').get())
      fail('Первоначальная настройка уже выполнена.', 409);
    const name = required(req.body.name, 'Имя');
    const studio = required(req.body.studio_name, 'Название студии', 60);
    const email = required(req.body.email, 'Email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Укажите корректный email.');
    const password = required(req.body.password, 'Пароль', 200);
    if (password.length < 10) fail('Пароль должен содержать минимум 10 символов.');
    const id = transaction(db, () => {
      db.prepare("UPDATE settings SET value = ? WHERE key = 'studio_name'").run(studio);
      return Number(
        db
          .prepare("INSERT INTO users(name, email, password_hash, role) VALUES (?, ?, ?, 'owner')")
          .run(name, email, hashPassword(password)).lastInsertRowid,
      );
    });
    res
      .status(201)
      .json(createSession(res, db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
  });
  app.post('/api/auth/login', (req, res) => {
    limitLogin(req);
    const email = required(req.body.email, 'Email').toLowerCase();
    const password = required(req.body.password, 'Пароль', 200);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !checkPassword(password, user.password_hash))
      fail('Неверный email или пароль.', 401);
    loginAttempts.delete(req.ip);
    res.json(createSession(res, user));
  });
  app.post('/api/auth/demo', (req, res) => {
    if (!isDemo()) fail('Демонстрационный вход отключён.', 404);
    const role = req.body.role;
    if (!['owner', 'admin', 'trainer'].includes(role)) fail('Неизвестная роль.');
    const email = `${role}@demo.local`;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) fail('Демонстрационная учётная запись недоступна.', 404);
    res.json(createSession(res, user));
  });
  app.use('/api', (req, _res, next) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    const session = token
      ? db
          .prepare('SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > ?')
          .get(tokenHash(token), Date.now())
      : undefined;
    if (!session) return next(new HttpError(401, 'Войдите в CRM, чтобы продолжить.'));
    req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
    req.sessionHash = tokenHash(token);
    next();
  });
  const office = (req, _res, next) =>
    req.user.role === 'trainer'
      ? next(new HttpError(403, 'Это действие доступно администратору или владельцу.'))
      : next();
  const owner = (req, _res, next) =>
    req.user.role !== 'owner'
      ? next(new HttpError(403, 'Это действие доступно владельцу.'))
      : next();
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(req.sessionHash);
    res.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookie,
      path: '/',
    });
    res.json({ ok: true });
  });
  app.get('/api/bootstrap', (req, res) => {
    const trainer = req.user.role === 'trainer';
    const classes = trainer
      ? db
          .prepare('SELECT * FROM classes WHERE instructor_id = ? ORDER BY date, time')
          .all(req.user.instructor_id)
      : db.prepare('SELECT * FROM classes ORDER BY date, time').all();
    const classIds = new Set(classes.map((c) => c.id));
    const bookings = db
      .prepare('SELECT * FROM bookings')
      .all()
      .filter((b) => !trainer || classIds.has(b.class_id));
    const clientIds = new Set(
      bookings.filter((b) => b.status !== 'cancelled').map((b) => b.client_id),
    );
    const clients = db
      .prepare('SELECT * FROM clients ORDER BY name')
      .all()
      .filter((c) => !trainer || clientIds.has(c.id));
    const settings = Object.fromEntries(
      db
        .prepare('SELECT key, value FROM settings')
        .all()
        .map((x) => [x.key, x.value]),
    );
    if (trainer) delete settings.monthly_goal;
    res.json({
      user: publicUser(req.user),
      today: today(),
      demo: isDemo(),
      settings,
      clients,
      classes,
      bookings,
      instructors: db.prepare('SELECT * FROM instructors ORDER BY name').all(),
      memberships: trainer
        ? []
        : db
            .prepare(
              "SELECT m.*, (SELECT count(*) FROM bookings b WHERE b.membership_id=m.id AND b.status='booked') AS reserved FROM memberships m ORDER BY m.id DESC",
            )
            .all(),
      plans: trainer ? [] : db.prepare('SELECT * FROM plans ORDER BY visits').all(),
      payments: trainer ? [] : readReceipts(db),
      sales: trainer ? [] : readSales(db),
      staff: trainer
        ? []
        : db.prepare("SELECT id,name,role FROM users WHERE role!='trainer' ORDER BY name").all(),
      leads: trainer ? [] : db.prepare('SELECT * FROM leads ORDER BY date DESC,id DESC').all(),
      funnels: trainer ? [] : db.prepare('SELECT * FROM funnels ORDER BY id').all(),
      duties: trainer ? [] : db.prepare('SELECT * FROM duties ORDER BY date,start_time').all(),
      tasks: trainer
        ? db
            .prepare(
              "SELECT * FROM tasks WHERE manager_id=? AND status!='deleted' ORDER BY due_date,due_time",
            )
            .all(req.user.id)
        : db
            .prepare("SELECT * FROM tasks WHERE status!='deleted' ORDER BY due_date,due_time")
            .all(),
      stages: trainer ? [] : db.prepare('SELECT * FROM stages ORDER BY position,id').all(),
      users:
        req.user.role === 'owner'
          ? db.prepare('SELECT id, name, email, role, instructor_id FROM users ORDER BY id').all()
          : [],
    });
  });
  function clientFields(body) {
    const name = required(body.name, 'Имя клиента');
    const digits = required(body.phone, 'Телефон', 30).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15)
      fail('Телефон должен содержать от 10 до 15 цифр.');
    const phone = `+${digits.length === 11 && digits.startsWith('8') ? '7' + digits.slice(1) : digits.length === 10 ? '7' + digits : digits}`;
    const email = optional(body.email, 150);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Укажите корректный email.');
    const birthday = optional(body.birthday, 10);
    if (birthday && (validDate(birthday) > today() || birthday < '1900-01-01'))
      fail('Укажите корректную дату рождения.');
    const gender = body.gender || 'unknown';
    if (!['female', 'male', 'unknown'].includes(gender))
      fail('Укажите пол или выберите «Не указан».');
    const managerId = body.manager_id ? integer(body.manager_id, 'Менеджер') : null;
    if (
      managerId &&
      !db.prepare("SELECT 1 FROM users WHERE id=? AND role!='trainer'").get(managerId)
    )
      fail('Менеджер не найден.');
    return [
      name,
      phone,
      email,
      birthday,
      optional(body.notes),
      optional(body.source, 60) || 'Студия',
      gender,
      optional(body.city, 100),
      optional(body.tags, 200),
      managerId,
    ];
  }
  app.post('/api/clients', office, (req, res) => {
    const values = clientFields(req.body);
    if (db.prepare('SELECT id FROM clients WHERE phone = ?').get(values[1]))
      fail('Клиент с таким телефоном уже есть в базе.', 409);
    const result = db
      .prepare(
        'INSERT INTO clients(name, phone, email, birthday, notes, source, gender, city, tags, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(...values, today());
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  app.patch('/api/clients/:id', office, (req, res) => {
    const id = integer(req.params.id, 'Клиент');
    if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(id)) fail('Клиент не найден.', 404);
    const values = clientFields(req.body);
    if (db.prepare('SELECT id FROM clients WHERE phone = ? AND id != ?').get(values[1], id))
      fail('Клиент с таким телефоном уже есть в базе.', 409);
    db.prepare(
      'UPDATE clients SET name=?, phone=?, email=?, birthday=?, notes=?, source=?, gender=?, city=?, tags=?, manager_id=? WHERE id=?',
    ).run(...values, id);
    res.json({ id });
  });
  app.patch('/api/clients/:id/archive', office, (req, res) => {
    const id = integer(req.params.id, 'Клиент');
    if (typeof req.body.archived !== 'boolean') fail('Некорректное значение архива.');
    if (
      !db
        .prepare('UPDATE clients SET archived_at=? WHERE id=?')
        .run(req.body.archived ? today() : null, id).changes
    )
      fail('Клиент не найден.', 404);
    res.json({ id });
  });
  app.post('/api/memberships', office, (req, res) => {
    const clientId = integer(req.body.client_id, 'Клиент');
    if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(clientId))
      fail('Клиент не найден.', 404);
    const plan = db
      .prepare('SELECT * FROM plans WHERE id = ?')
      .get(integer(req.body.plan_id, 'Абонемент'));
    if (!plan) fail('Тариф не найден.', 404);
    const method = req.body.method;
    if (!['card', 'cash', 'transfer'].includes(method)) fail('Выберите способ оплаты.');
    const paid = integer(req.body.paid_amount ?? plan.price, 'Полученная сумма', 0, plan.price);
    const start = validDate(req.body.start_date || today());
    if (start < today()) fail('Дата начала не может быть в прошлом.');
    const id = transaction(db, () => {
      const id = Number(
        db
          .prepare(
            'INSERT INTO memberships(client_id, plan_id, name, total, remaining, start_date, end_date, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            clientId,
            plan.id,
            plan.name,
            plan.visits,
            plan.visits,
            start,
            shiftDate(start, plan.days - 1),
            plan.price,
          ).lastInsertRowid,
      );
      addSale(db, {
        clientId,
        membershipId: id,
        category: 'membership',
        description: plan.name,
        total: plan.price,
        paid,
        method,
        date: today(),
        userId: req.user.id,
      });
      return id;
    });
    res.status(201).json({ id });
  });
  app.post('/api/classes', office, (req, res) => {
    const title = required(req.body.title, 'Название', 80);
    const type = req.body.type;
    if (!['soft', 'stretch', 'pilates', 'split', 'back'].includes(type))
      fail('Выберите направление.');
    const instructorId = integer(req.body.instructor_id, 'Тренер');
    if (!db.prepare('SELECT 1 FROM instructors WHERE id = ?').get(instructorId))
      fail('Тренер не найден.', 404);
    const date = validDate(req.body.date);
    if (date < today()) fail('Нельзя добавить занятие в прошлом.');
    const time = required(req.body.time, 'Время', 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Укажите корректное время.');
    const duration = integer(req.body.duration, 'Длительность', 15, 180);
    const capacity = integer(req.body.capacity, 'Вместимость', 1, 100);
    const room = optional(req.body.room, 60) || 'Основной зал';
    if (minutes(time) + duration > 24 * 60) fail('Занятие должно закончиться до полуночи.');
    const conflicts = db
      .prepare(
        "SELECT * FROM classes WHERE date=? AND status='scheduled' AND (room=? OR instructor_id=?)",
      )
      .all(date, room, instructorId);
    if (
      conflicts.some(
        (c) =>
          minutes(time) < minutes(c.time) + c.duration &&
          minutes(time) + duration > minutes(c.time),
      )
    )
      fail('В это время зал или тренер уже заняты.', 409);
    const result = db
      .prepare(
        'INSERT INTO classes(title,type,instructor_id,date,time,duration,capacity,room) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(title, type, instructorId, date, time, duration, capacity, room);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  app.post('/api/classes/:id/cancel', office, (req, res) => {
    const id = integer(req.params.id, 'Занятие');
    const klass = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
    if (!klass) fail('Занятие не найдено.', 404);
    if (
      klass.date < today() ||
      db.prepare("SELECT 1 FROM bookings WHERE class_id = ? AND status = 'attended'").get(id)
    )
      fail('Нельзя отменить прошедшее занятие или занятие с отмеченными посещениями.');
    transaction(db, () => {
      db.prepare("UPDATE classes SET status = 'cancelled' WHERE id = ?").run(id);
      db.prepare(
        "UPDATE bookings SET status = 'cancelled' WHERE class_id = ? AND status = 'booked'",
      ).run(id);
    });
    res.json({ ok: true });
  });
  app.post('/api/bookings', office, (req, res) => {
    const classId = integer(req.body.class_id, 'Занятие');
    const clientId = integer(req.body.client_id, 'Клиент');
    const membershipId = integer(req.body.membership_id, 'Абонемент');
    const id = transaction(db, () => {
      const klass = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
      if (!klass || klass.status === 'cancelled') fail('Занятие недоступно.', 404);
      if (klass.date < today()) fail('Нельзя записать клиента на прошедшее занятие.');
      if (
        db
          .prepare(
            "SELECT 1 FROM bookings WHERE class_id = ? AND client_id = ? AND status != 'cancelled'",
          )
          .get(classId, clientId)
      )
        fail('Клиент уже записан на это занятие.', 409);
      if (
        db
          .prepare(
            "SELECT count(*) AS n FROM bookings WHERE class_id = ? AND status != 'cancelled'",
          )
          .get(classId).n >= klass.capacity
      )
        fail('На занятии нет свободных мест.', 409);
      const m = db
        .prepare('SELECT * FROM memberships WHERE id = ? AND client_id = ?')
        .get(membershipId, clientId);
      if (!m || m.start_date > klass.date || m.end_date < klass.date)
        fail('Абонемент не действует в день занятия.');
      const reserved = db
        .prepare("SELECT count(*) AS n FROM bookings WHERE membership_id = ? AND status = 'booked'")
        .get(m.id).n;
      if (m.remaining <= reserved)
        fail('Все оставшиеся занятия по абонементу уже использованы или зарезервированы.');
      const conflicts = db
        .prepare(
          "SELECT c.* FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.client_id=? AND b.status != 'cancelled' AND c.date=?",
        )
        .all(clientId, klass.date);
      if (
        conflicts.some(
          (c) =>
            minutes(klass.time) < minutes(c.time) + c.duration &&
            minutes(klass.time) + klass.duration > minutes(c.time),
        )
      )
        fail('У клиента уже есть запись на это время.', 409);
      return Number(
        db
          .prepare(
            "INSERT INTO bookings(class_id,client_id,membership_id,status,created_at) VALUES (?,?,?,'booked',?)",
          )
          .run(classId, clientId, membershipId, new Date().toISOString()).lastInsertRowid,
      );
    });
    res.status(201).json({ id });
  });
  app.patch('/api/bookings/:id', (req, res) => {
    const id = integer(req.params.id, 'Запись');
    const status = req.body.status;
    if (!['attended', 'cancelled'].includes(status)) fail('Недопустимый статус.');
    transaction(db, () => {
      const booking = db
        .prepare(
          'SELECT b.*, c.instructor_id, c.date FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.id=?',
        )
        .get(id);
      if (!booking) fail('Запись не найдена.', 404);
      if (
        req.user.role === 'trainer' &&
        (booking.instructor_id !== req.user.instructor_id || status !== 'attended')
      )
        fail('Тренер может отмечать посещения только на своих занятиях.', 403);
      if (booking.status === status) return;
      if (booking.status !== 'booked') fail('Эта запись уже обработана.', 409);
      if (status === 'attended') {
        if (booking.date > today()) fail('Посещение можно отметить в день занятия или позже.');
        const changed = db
          .prepare('UPDATE memberships SET remaining=remaining-1 WHERE id=? AND remaining>0')
          .run(booking.membership_id);
        if (!changed.changes) fail('В абонементе не осталось занятий.', 409);
      }
      db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status, id);
    });
    res.json({ ok: true });
  });
  app.post('/api/users', owner, (req, res) => {
    const name = required(req.body.name, 'Имя');
    const email = required(req.body.email, 'Email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Укажите корректный email.');
    const password = required(req.body.password, 'Пароль', 200);
    if (password.length < 10) fail('Пароль должен содержать минимум 10 символов.');
    const role = req.body.role;
    if (!['admin', 'trainer'].includes(role)) fail('Выберите роль администратора или тренера.');
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email))
      fail('Сотрудник с таким email уже существует.', 409);
    const specialty = optional(req.body.specialty, 100) || 'Растяжка';
    const id = transaction(db, () => {
      const instructorId =
        role === 'trainer'
          ? Number(
              db
                .prepare("INSERT INTO instructors(name,specialty,color) VALUES (?,?,'purple')")
                .run(name, specialty).lastInsertRowid,
            )
          : null;
      return Number(
        db
          .prepare(
            'INSERT INTO users(name,email,password_hash,role,instructor_id) VALUES (?,?,?,?,?)',
          )
          .run(name, email, hashPassword(password), role, instructorId).lastInsertRowid,
      );
    });
    res.status(201).json({ id });
  });
  app.patch('/api/settings', owner, (req, res) => {
    const settings = {
      studio_name: required(req.body.studio_name, 'Название студии', 60),
      subtitle: required(req.body.subtitle, 'Подпись', 80),
      address: optional(req.body.address, 200),
      phone: optional(req.body.phone, 30),
      monthly_goal: String(integer(req.body.monthly_goal, 'План выручки', 1, 100000000)),
    };
    transaction(db, () => {
      for (const [key, value] of Object.entries(settings))
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(value, key);
    });
    res.json({ ok: true });
  });
  registerReports(app, db, { office, fail, required, optional, integer, validDate });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Метод не найден.' }));
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(staticDir, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Некорректный JSON.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Слишком большой запрос.' });
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'Не удалось выполнить действие. Попробуйте ещё раз.' });
  });
  return app;
}
