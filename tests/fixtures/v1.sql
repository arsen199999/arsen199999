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

INSERT INTO settings(key,value) VALUES ('initialized','1'),('demo','0'),('studio_name','Рабочая студия'),('subtitle','Растяжка'),('monthly_goal','100000');
INSERT INTO users(id,name,email,password_hash,role) VALUES (1,'Владелец','owner@example.local','existing-hash','owner');
INSERT INTO instructors(id,name,specialty,color) VALUES (1,'Тренер','Растяжка','blue');
INSERT INTO clients(id,name,phone,email,birthday,notes,source,created_at) VALUES (1,'Существующий клиент','+79990000001','','1990-05-01','Сохранить заметку','Сайт','2026-09-01');
INSERT INTO plans(id,name,visits,days,price,color) VALUES (1,'Пробный',1,14,700,'blue');
INSERT INTO memberships(id,client_id,plan_id,name,total,remaining,start_date,end_date,price) VALUES (1,1,1,'Пробный',1,0,'2026-09-01','2026-09-14',700);
INSERT INTO payments(id,client_id,membership_id,amount,method,description,date,created_by) VALUES (1,1,1,700,'card','Пробный','2026-09-01T10:00:00.000Z',1);
INSERT INTO classes(id,title,type,instructor_id,date,time,duration,capacity) VALUES (1,'Растяжка','stretch',1,'2026-09-02','12:00',60,10);
INSERT INTO bookings(id,class_id,client_id,membership_id,status,created_at) VALUES (1,1,1,1,'attended','2026-09-01T10:00:00.000Z');
