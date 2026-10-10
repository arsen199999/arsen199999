// Version 2 keeps the original payments table intact. Receipts is the sole
// ledger used by the application after a transactional, one-time migration.
export function studioDate(value) {
  if (!value.includes('T')) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(value));
}
export function membershipKind(previous, date) {
  if (!previous) return 'new';
  const gap = (Date.parse(date) - Date.parse(previous.end_date)) / 86400000;
  return gap > 30 ? 'return' : 'renewal';
}
export function migrateAnalytics(db) {
  if (db.prepare("SELECT value FROM settings WHERE key='analytics_schema'").get()) return;
  if (
    !db
      .prepare('PRAGMA table_info(clients)')
      .all()
      .some((c) => c.name === 'gender')
  ) {
    db.exec(
      "ALTER TABLE clients ADD COLUMN gender TEXT NOT NULL DEFAULT 'unknown' CHECK(gender IN ('female','male','unknown'))",
    );
  }
  for (const [name, definition] of [
    ['city', "TEXT NOT NULL DEFAULT ''"],
    ['tags', "TEXT NOT NULL DEFAULT ''"],
    ['manager_id', 'INTEGER REFERENCES users(id)'],
    ['archived_at', 'TEXT'],
  ]) {
    if (
      !db
        .prepare('PRAGMA table_info(clients)')
        .all()
        .some((c) => c.name === name)
    )
      db.exec(`ALTER TABLE clients ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`
    CREATE TABLE sales (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id),
      membership_id INTEGER UNIQUE REFERENCES memberships(id),
      category TEXT NOT NULL CHECK(category IN ('membership','service','product')),
      description TEXT NOT NULL, total INTEGER NOT NULL CHECK(total>0), date TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id), source TEXT NOT NULL,
      lead_id INTEGER REFERENCES leads(id),
      membership_kind TEXT CHECK(membership_kind IN ('new','renewal','return'))
    );
    CREATE TABLE receipts (
      id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id),
      amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL CHECK(method IN ('card','cash','transfer')),
      date TEXT NOT NULL, created_by INTEGER REFERENCES users(id), legacy_payment_id INTEGER UNIQUE
    );
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY, description TEXT NOT NULL, category TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount>0), date TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
    );
    CREATE TABLE funnels (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE stages (id INTEGER PRIMARY KEY, funnel_id INTEGER NOT NULL REFERENCES funnels(id), name TEXT NOT NULL,
      position INTEGER NOT NULL, color TEXT NOT NULL DEFAULT '#3498db');
    INSERT INTO funnels(id,name) VALUES (1,'Стандартная');
    INSERT INTO stages(funnel_id,name,position,color) VALUES
      (1,'Неразобранные',0,'#94a3b8'),(1,'В работе',1,'#3498db'),
      (1,'Выбираем время на пробное',2,'#e6b23b'),(1,'Записаны на пробное',3,'#9b59b6'),
      (1,'Ждём оплату',4,'#e08b59'),(1,'Успешно',5,'#17ad86');
    CREATE TABLE leads (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, source TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','trial','won','archived')),
      client_id INTEGER REFERENCES clients(id), date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
      converted_at TEXT, archived_at TEXT,
      stage_id INTEGER NOT NULL DEFAULT 1 REFERENCES stages(id),
      manager_id INTEGER REFERENCES users(id), amount INTEGER NOT NULL DEFAULT 0 CHECK(amount>=0),
      tags TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('call','meeting','task')),
      due_date TEXT NOT NULL, due_time TEXT NOT NULL, manager_id INTEGER REFERENCES users(id),
      client_id INTEGER REFERENCES clients(id), lead_id INTEGER REFERENCES leads(id),
      notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','deleted')),
      completed_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE duties (id INTEGER PRIMARY KEY, manager_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '');
    CREATE INDEX tasks_date ON tasks(due_date,status);
    CREATE INDEX sales_date ON sales(date);
    CREATE INDEX receipts_date ON receipts(date);
    CREATE INDEX receipts_sale ON receipts(sale_id);
    CREATE INDEX expenses_date ON expenses(date);
    CREATE INDEX leads_date ON leads(date);
  `);
  const previous = new Map();
  for (const m of db.prepare('SELECT * FROM memberships ORDER BY start_date, id').all()) {
    const payments = db
      .prepare('SELECT * FROM payments WHERE membership_id=? ORDER BY date,id')
      .all(m.id);
    const date = payments.length ? studioDate(payments[0].date) : m.start_date;
    const source = db.prepare('SELECT source FROM clients WHERE id=?').get(m.client_id).source;
    const sale = db
      .prepare(
        "INSERT INTO sales(client_id,membership_id,category,description,total,date,created_by,source,membership_kind) VALUES (?,?,'membership',?,?,?,?,?,?)",
      )
      .run(
        m.client_id,
        m.id,
        m.name,
        m.price,
        date,
        payments[0]?.created_by ?? null,
        source,
        membershipKind(previous.get(m.client_id), date),
      );
    for (const p of payments)
      db.prepare(
        'INSERT INTO receipts(sale_id,amount,method,date,created_by,legacy_payment_id) VALUES (?,?,?,?,?,?)',
      ).run(sale.lastInsertRowid, p.amount, p.method, studioDate(p.date), p.created_by, p.id);
    previous.set(m.client_id, m);
  }
  db.prepare("INSERT INTO settings(key,value) VALUES ('analytics_schema','2')").run();
}
export function readReceipts(db) {
  return db
    .prepare(
      `SELECT r.id,r.sale_id,r.amount,r.method,r.date,r.created_by,
    s.client_id,s.membership_id,s.description,s.category,s.membership_kind,s.source,s.created_by AS seller_id,s.lead_id
    FROM receipts r JOIN sales s ON s.id=r.sale_id ORDER BY r.date DESC,r.id DESC`,
    )
    .all();
}
export function readSales(db) {
  return db
    .prepare(
      `SELECT s.*,coalesce(sum(r.amount),0) AS paid,
    max(0,s.total-coalesce(sum(r.amount),0)) AS debt FROM sales s LEFT JOIN receipts r ON r.sale_id=s.id
    GROUP BY s.id ORDER BY s.date DESC,s.id DESC`,
    )
    .all();
}
export function addSale(
  db,
  { clientId, membershipId = null, category, description, total, paid, method, date, userId },
) {
  const client = db.prepare('SELECT source FROM clients WHERE id=?').get(clientId);
  const lead = db
    .prepare(
      'SELECT id,source FROM leads WHERE client_id=? AND date<=? AND converted_at<=? ORDER BY date DESC,id DESC LIMIT 1',
    )
    .get(clientId, date, date);
  const source = lead?.source || client.source;
  const previous = membershipId
    ? db
        .prepare(
          'SELECT * FROM memberships WHERE client_id=? AND id!=? ORDER BY start_date DESC,id DESC LIMIT 1',
        )
        .get(clientId, membershipId)
    : null;
  const id = Number(
    db
      .prepare(
        'INSERT INTO sales(client_id,membership_id,category,description,total,date,created_by,source,membership_kind,lead_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        clientId,
        membershipId,
        category,
        description,
        total,
        date,
        userId,
        source,
        category === 'membership' ? membershipKind(previous, date) : null,
        lead?.id ?? null,
      ).lastInsertRowid,
  );
  if (paid > 0)
    db.prepare(
      'INSERT INTO receipts(sale_id,amount,method,date,created_by) VALUES (?,?,?,?,?)',
    ).run(id, paid, method, date, userId);
  return id;
}
