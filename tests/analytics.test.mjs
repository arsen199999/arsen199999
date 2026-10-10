import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, today, shiftDate } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { addSale } from '../server/ledger.mjs';
import { buildReports } from '../server/reports.mjs';

function fixture() {
  const db = openDatabase(':memory:', false);
  db.prepare(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES (1,'Менеджер','m@test.local','unused','owner')",
  ).run();
  db.prepare(
    "INSERT INTO clients(id,name,phone,source,created_at,birthday,gender) VALUES (1,'Клиент А','+79990000001','Сайт','2026-01-01','2000-10-20','female'),(2,'Клиент Б','+79990000002','Рекомендация','2026-01-02','','unknown')",
  ).run();
  return db;
}
test('cash, historical debt, expenses and order averages handle instalments without double counting', () => {
  const db = fixture();
  try {
    const id = addSale(db, {
      clientId: 1,
      category: 'service',
      description: 'Услуга',
      total: 1000,
      paid: 300,
      method: 'cash',
      date: '2026-09-01',
      userId: 1,
    });
    db.prepare(
      "INSERT INTO receipts(sale_id,amount,method,date,created_by) VALUES (?,700,'card','2026-10-10',1)",
    ).run(id);
    db.prepare(
      "INSERT INTO expenses(description,category,amount,date,created_by) VALUES ('Аренда','Аренда',100,'2026-09-10',1)",
    ).run();
    const now = new Date('2026-10-20T12:00:00Z');
    const sept = buildReports(db, '2026-09-01', '2026-09-30', now);
    assert.equal(sept.overview.revenue, 300);
    assert.equal(sept.overview.expenses, 100);
    assert.equal(sept.overview.net, 200);
    assert.equal(sept.overview.debt_total, 700);
    assert.equal(sept.overview.debt_period, 700);
    assert.equal(sept.sales.categories.find((c) => c.category === 'service').average_check, 1000);
    const oct = buildReports(db, '2026-10-01', '2026-10-20', now);
    assert.equal(oct.overview.revenue, 700);
    assert.equal(oct.overview.debt_total, 0);
    assert.equal(oct.sales.categories.find((c) => c.category === 'service').average_check, null);
    assert.equal(oct.clients.ltv, 500);
    assert.equal(oct.daily.at(-1).cumulative, 700);
    assert.equal(oct.overview.app_installs, null);
  } finally {
    db.close();
  }
});
test('age changes on birthday; missing demographics and zero denominators remain explicit', () => {
  const db = fixture();
  try {
    assert.equal(
      buildReports(db, '2026-10-01', '2026-10-19', new Date('2026-10-20T12:00:00Z')).clients
        .average_age,
      25,
    );
    const r = buildReports(db, '2026-10-01', '2026-10-20', new Date('2026-10-20T12:00:00Z'));
    assert.equal(r.clients.average_age, 26);
    assert.equal(r.clients.ages.find((a) => a.name === 'Возраст не указан').value, 1);
    assert.equal(r.classes.attendance, null);
    assert.equal(r.overview.renewal_rate, null);
  } finally {
    db.close();
  }
  const empty = openDatabase(':memory:', false);
  try {
    const r = buildReports(empty, today(), today());
    assert.equal(r.clients.ltv, null);
    assert.equal(r.clients.visits_per_client, null);
    assert.deepEqual(r.marketing.sources, []);
  } finally {
    empty.close();
  }
});
test('marketing attributes one sale to one lead and snapshots the source', () => {
  const db = fixture();
  try {
    const insert = db.prepare(
      "INSERT INTO leads(name,phone,source,date,client_id,converted_at) VALUES ('А','+79990000001','Сайт',?,1,?)",
    );
    insert.run('2026-09-01', '2026-09-01');
    insert.run('2026-09-05', '2026-09-05');
    addSale(db, {
      clientId: 1,
      category: 'service',
      description: 'Услуга',
      total: 1000,
      paid: 1000,
      method: 'cash',
      date: '2026-09-06',
      userId: 1,
    });
    db.prepare("UPDATE clients SET source='Другое' WHERE id=1").run();
    const r = buildReports(db, '2026-09-01', '2026-09-30', new Date('2026-10-20T12:00:00Z'));
    assert.equal(r.marketing.leads, 2);
    assert.equal(r.marketing.paid, 1);
    assert.equal(r.marketing.conversion, 50);
    assert.equal(r.marketing.channels[0].revenue, 1000);
  } finally {
    db.close();
  }
});
test('occupancy, attendance and renewals use the selected date and exclude cancelled classes', () => {
  const db = fixture();
  try {
    db.prepare(
      "INSERT INTO instructors(id,name,specialty,color) VALUES (1,'Тренер','Растяжка','blue')",
    ).run();
    db.prepare(
      "INSERT INTO memberships(id,client_id,plan_id,name,total,remaining,start_date,end_date,price) VALUES (1,1,1,'Пробный',1,0,'2026-09-01','2026-09-30',700),(2,1,2,'Продление',4,4,'2026-09-10','2026-10-09',4200)",
    ).run();
    for (const [id, price, date] of [
      [1, 700, '2026-09-01'],
      [2, 4200, '2026-09-08'],
    ])
      addSale(db, {
        clientId: 1,
        membershipId: id,
        category: 'membership',
        description: 'Абонемент',
        total: price,
        paid: price,
        method: 'card',
        date,
        userId: 1,
      });
    db.prepare(
      "INSERT INTO classes(id,title,type,instructor_id,date,time,duration,capacity,room,status) VALUES (1,'Растяжка','stretch',1,'2026-09-05','10:00',60,10,'Зал','scheduled'),(2,'Отмена','stretch',1,'2026-09-06','10:00',60,10,'Зал','cancelled'),(3,'Будущее','stretch',1,'2026-09-25','10:00',60,10,'Зал','scheduled')",
    ).run();
    db.prepare(
      "INSERT INTO bookings(class_id,client_id,membership_id,status,created_at) VALUES (1,1,1,'attended','2026-09-01'),(3,1,2,'booked','2026-09-01')",
    ).run();
    const early = buildReports(db, '2026-09-01', '2026-09-07', new Date('2026-09-20T12:00:00Z'));
    assert.equal(early.overview.active_clients, 0);
    assert.equal(early.overview.ended_memberships, 1);
    assert.equal(early.overview.renewal_rate, 0);
    const r = buildReports(db, '2026-09-01', '2026-09-30', new Date('2026-09-20T12:00:00Z'));
    assert.equal(r.overview.active_clients, 1);
    assert.equal(r.overview.renewal_rate, 100);
    assert.equal(r.classes.count, 2);
    assert.equal(r.classes.occupancy, 10);
    assert.equal(r.classes.attendance, 100);
    assert.equal(r.overview.visits, 1);
  } finally {
    db.close();
  }
});
test('version 1 database migrates once, preserves original rows and creates a restorable backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'linia-migration-'));
  let db;
  try {
    const initial = new DatabaseSync(join(dir, 'studio.sqlite'));
    initial.exec(readFileSync(new URL('./fixtures/v1.sql', import.meta.url), 'utf8'));
    initial.close();
    const old = new DatabaseSync(join(dir, 'studio.sqlite'));
    const payments = old.prepare('SELECT count(*) n,sum(amount) total FROM payments').get();
    const clients = old.prepare('SELECT * FROM clients ORDER BY id').all();
    const bookings = old.prepare('SELECT * FROM bookings ORDER BY id').all();
    old.close();
    db = openDatabase(join(dir, 'studio.sqlite'), false);
    assert.equal(db.prepare('SELECT count(*) n FROM receipts').get().n, payments.n);
    assert.equal(db.prepare('SELECT sum(amount) total FROM receipts').get().total, payments.total);
    assert.deepEqual(db.prepare('SELECT * FROM bookings ORDER BY id').all(), bookings);
    for (const c of clients) {
      const migrated = db.prepare('SELECT * FROM clients WHERE id=?').get(c.id);
      for (const [k, v] of Object.entries(c)) assert.equal(migrated[k], v);
    }
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    db.close();
    db = null;
    db = openDatabase(join(dir, 'studio.sqlite'), false);
    assert.equal(db.prepare('SELECT count(*) n FROM receipts').get().n, payments.n);
    const backups = readdirSync(join(dir, 'backups'));
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(join(dir, 'backups', backups[0]), { readOnly: true });
    assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(backup.prepare('SELECT count(*) n FROM clients').get().n, clients.length);
    backup.close();
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('new APIs enforce roles, validate dates, prevent overpayment and persist funnels, tasks and archives', async () => {
  const db = openDatabase(':memory:', true),
    server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie;
  async function request(path, method = 'GET', body, otherCookie = cookie) {
    const r = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(otherCookie ? { cookie: otherCookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  try {
    cookie = (await request('/auth/demo', 'POST', { role: 'owner' })).cookie;
    const trainer = (await request('/auth/demo', 'POST', { role: 'trainer' })).cookie;
    assert.equal(
      (await request('/reports?from=2026-10-01&to=2026-10-10', 'GET', undefined, trainer)).status,
      403,
    );
    for (const path of ['/sales', '/expenses', '/leads', '/tasks', '/funnels', '/duties'])
      assert.equal((await request(path, 'POST', {}, trainer)).status, 403);
    assert.equal((await request('/reports?from=2026-02-30&to=2026-03-05')).status, 400);
    assert.equal((await request('/reports?from=2020-01-01&to=2026-10-10')).status, 400);
    const sale = await request('/sales', 'POST', {
      client_id: 1,
      category: 'product',
      description: 'Носки',
      total: 1000,
      paid_amount: 300,
      method: 'cash',
      date: today(),
    });
    assert.equal(sale.status, 201);
    assert.equal(
      (await request(`/sales/${sale.body.id}/payments`, 'POST', { amount: 701, method: 'card' }))
        .status,
      409,
    );
    assert.equal(
      (await request(`/sales/${sale.body.id}/payments`, 'POST', { amount: 700, method: 'card' }))
        .status,
      201,
    );
    assert.equal(
      (await request(`/sales/${sale.body.id}/payments`, 'POST', { amount: 1, method: 'card' }))
        .status,
      409,
    );
    const funnel = await request('/funnels', 'POST', {
      name: 'Пробные',
      stages: [
        { name: 'Новая', color: '#3498db' },
        { name: 'Пробное', color: '#17ad86' },
      ],
    });
    assert.equal(funnel.status, 201);
    let boot = (await request('/bootstrap')).body;
    const stages = boot.stages.filter((s) => s.funnel_id === funnel.body.id);
    const lead = await request('/leads', 'POST', {
      name: 'Новая заявка',
      phone: '89998886655',
      source: 'Сайт',
      date: today(),
      stage_id: stages[0].id,
      manager_id: 1,
      amount: 500,
      tags: 'Пробное',
    });
    assert.equal(lead.status, 201);
    assert.equal(
      (
        await request(`/funnels/${funnel.body.id}`, 'PATCH', {
          name: 'Пробные',
          stages: [stages[1]],
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(`/leads/${lead.body.id}`, 'PATCH', { stage_id: stages[1].id })).status,
      200,
    );
    assert.equal(
      (await request(`/leads/${lead.body.id}`, 'PATCH', { stage_id: 9999 })).status,
      404,
    );
    const conversion = await request(`/leads/${lead.body.id}/convert`, 'POST', {});
    assert.equal(conversion.status, 200);
    assert.equal(
      (await request(`/leads/${lead.body.id}/convert`, 'POST', {})).body.id,
      conversion.body.id,
    );
    const taskBody = {
      title: 'Позвонить',
      type: 'call',
      due_date: today(),
      due_time: '12:00',
      manager_id: 1,
      client_id: conversion.body.id,
      lead_id: lead.body.id,
    };
    const task = await request('/tasks', 'POST', taskBody);
    assert.equal(task.status, 201);
    assert.equal(
      (
        await request(`/tasks/${task.body.id}`, 'PATCH', {
          ...taskBody,
          due_date: shiftDate(today(), 1),
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/tasks/${task.body.id}`, 'PATCH', { status: 'done' })).status,
      200,
    );
    assert.equal(
      (await request(`/clients/${conversion.body.id}/archive`, 'PATCH', { archived: true })).status,
      200,
    );
    assert.equal(
      (
        await request('/duties', 'POST', {
          manager_id: 1,
          date: today(),
          start_time: '09:00',
          end_time: '18:00',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request('/duties', 'POST', {
          manager_id: 1,
          date: today(),
          start_time: '10:00',
          end_time: '19:00',
        })
      ).status,
      409,
    );
    boot = (await request('/bootstrap')).body;
    assert.equal(boot.tasks.find((t) => t.id === task.body.id).status, 'done');
    assert.equal(boot.clients.find((c) => c.id === conversion.body.id).archived_at, today());
    const hidden = (await request('/bootstrap', 'GET', undefined, trainer)).body;
    for (const k of ['leads', 'funnels', 'stages', 'sales', 'staff', 'duties'])
      assert.deepEqual(hidden[k], []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
