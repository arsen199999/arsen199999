import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { openDatabase, today, shiftDate } from '../server/db.mjs';

describe(
  'Studio CRM: accounts, sales, bookings and role boundaries',
  { concurrency: false },
  () => {
    let db,
      server,
      base,
      ownerCookie,
      trainerCookie,
      otherTrainerCookie,
      adminCookie,
      clientId,
      membershipId,
      classId,
      trainerId,
      bookingId,
      planId;
    const password = 'Test-password-327!';
    async function request(
      path,
      { method = 'GET', body, cookie = ownerCookie, headers = {} } = {},
    ) {
      const response = await fetch(`${base}/api${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
        headers: response.headers,
      };
    }
    before(async () => {
      db = openDatabase(':memory:', false);
      server = createApp(db, { staticDir: '/nonexistent' }).listen(0, '127.0.0.1');
      await once(server, 'listening');
      base = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    });

    test('fresh studio requires owner setup; private data requires login', async () => {
      assert.equal((await request('/bootstrap')).status, 401);
      const status = await request('/auth/status');
      assert.equal(status.body.needsSetup, true);
      assert.equal(status.body.demo, false);
      assert.equal(
        (await request('/auth/demo', { method: 'POST', body: { role: 'owner' } })).status,
        404,
      );
      const setup = await request('/auth/setup', {
        method: 'POST',
        body: { name: 'Владелец', studio_name: 'Баланс', email: 'owner@example.com', password },
      });
      assert.equal(setup.status, 201);
      assert.equal(setup.body.role, 'owner');
      assert.ok(setup.headers.get('set-cookie').includes('HttpOnly'));
      assert.ok(setup.headers.get('set-cookie').includes('SameSite=Strict'));
      ownerCookie = setup.cookie;
      assert.equal((await request('/auth/setup', { method: 'POST', body: {} })).status, 409);
      assert.equal(
        (
          await request('/auth/login', {
            method: 'POST',
            body: { email: 'owner@example.com', password: 'wrong' },
          })
        ).status,
        401,
      );
    });

    test('owner creates trainer and admin; account passwords are never returned', async () => {
      for (const [name, email, role] of [
        ['Первый тренер', 'trainer@example.com', 'trainer'],
        ['Другой тренер', 'other@example.com', 'trainer'],
        ['Администратор', 'admin@example.com', 'admin'],
      ]) {
        const result = await request('/users', {
          method: 'POST',
          body: { name, email, password, role },
        });
        assert.equal(result.status, 201);
      }
      const login = await request('/auth/login', {
        method: 'POST',
        body: { email: 'trainer@example.com', password },
      });
      assert.equal(login.status, 200);
      trainerCookie = login.cookie;
      trainerId = login.body.instructor_id;
      otherTrainerCookie = (
        await request('/auth/login', {
          method: 'POST',
          body: { email: 'other@example.com', password },
        })
      ).cookie;
      adminCookie = (
        await request('/auth/login', {
          method: 'POST',
          body: { email: 'admin@example.com', password },
        })
      ).cookie;
      const boot = await request('/bootstrap');
      assert.equal(boot.body.users.length, 4);
      assert.equal(JSON.stringify(boot.body).includes('password'), false);
      planId = boot.body.plans.find((p) => p.visits === 1).id;
    });

    test('admin can add clients, normalize phone numbers, and edit without duplicates', async () => {
      const client = await request('/clients', {
        method: 'POST',
        cookie: adminCookie,
        body: { name: 'Тестовый клиент', phone: '8 (999) 123-45-67' },
      });
      assert.equal(client.status, 201);
      clientId = client.body.id;
      const boot = await request('/bootstrap');
      assert.equal(boot.body.clients[0].phone, '+79991234567');
      assert.equal(
        (
          await request('/clients', {
            method: 'POST',
            body: { name: 'Дубль', phone: '+79991234567' },
          })
        ).status,
        409,
      );
      assert.equal(
        (await request('/clients', { method: 'POST', body: { name: 'Ошибка', phone: '123' } }))
          .status,
        400,
      );
      assert.equal(
        (
          await request(`/clients/${clientId}`, {
            method: 'PATCH',
            body: { name: 'Тестовый клиент', phone: '9991234567', notes: 'Вечерние занятия' },
          })
        ).status,
        200,
      );
    });

    test('sale atomically creates membership and payment for the exact plan price', async () => {
      const sale = await request('/memberships', {
        method: 'POST',
        body: {
          client_id: clientId,
          plan_id: planId,
          method: 'card',
          start_date: today(),
          price: 1,
        },
      });
      assert.equal(sale.status, 201);
      membershipId = sale.body.id;
      const boot = await request('/bootstrap');
      assert.equal(boot.body.memberships[0].remaining, 1);
      assert.equal(boot.body.memberships[0].end_date, shiftDate(today(), 13));
      assert.equal(boot.body.payments[0].amount, 700);
      assert.equal(boot.body.payments[0].membership_id, membershipId);
      assert.equal(boot.body.payments[0].date, today());
      assert.equal(
        (
          await request('/memberships', {
            method: 'POST',
            body: { client_id: clientId, plan_id: planId, method: 'invalid' },
          })
        ).status,
        400,
      );
      assert.equal((await request('/bootstrap')).body.payments.length, 1);
    });

    test('class validates date, trainer and room overlap', async () => {
      const payload = {
        title: 'Растяжка',
        type: 'stretch',
        instructor_id: trainerId,
        date: today(),
        time: '10:00',
        duration: 55,
        capacity: 1,
      };
      const klass = await request('/classes', { method: 'POST', body: payload });
      assert.equal(klass.status, 201);
      classId = klass.body.id;
      assert.equal(
        (await request('/classes', { method: 'POST', body: { ...payload, time: '10:30' } })).status,
        409,
      );
      assert.equal(
        (await request('/classes', { method: 'POST', body: { ...payload, date: '2026-02-31' } }))
          .status,
        400,
      );
      assert.equal(
        (await request('/classes', { method: 'POST', body: { ...payload, instructor_id: 9999 } }))
          .status,
        404,
      );
    });

    test('booking reserves a visit, blocks duplicates, overbooking and over-reservation', async () => {
      const booking = await request('/bookings', {
        method: 'POST',
        body: { class_id: classId, client_id: clientId, membership_id: membershipId },
      });
      assert.equal(booking.status, 201);
      bookingId = booking.body.id;
      assert.equal((await request('/bootstrap')).body.memberships[0].remaining, 1);
      assert.equal((await request('/bootstrap')).body.memberships[0].reserved, 1);
      assert.equal(
        (
          await request('/bookings', {
            method: 'POST',
            body: { class_id: classId, client_id: clientId, membership_id: membershipId },
          })
        ).status,
        409,
      );
      const second = await request('/classes', {
        method: 'POST',
        body: {
          title: 'Растяжка 2',
          type: 'stretch',
          instructor_id: trainerId,
          date: today(),
          time: '12:00',
          duration: 55,
          capacity: 8,
        },
      });
      assert.equal(
        (
          await request('/bookings', {
            method: 'POST',
            body: { class_id: second.body.id, client_id: clientId, membership_id: membershipId },
          })
        ).status,
        400,
      );
      const other = await request('/clients', {
        method: 'POST',
        body: { name: 'Другой клиент', phone: '+79992222222' },
      });
      const sale = await request('/memberships', {
        method: 'POST',
        body: { client_id: other.body.id, plan_id: planId, method: 'cash' },
      });
      assert.equal(
        (
          await request('/bookings', {
            method: 'POST',
            body: { class_id: classId, client_id: other.body.id, membership_id: sale.body.id },
          })
        ).status,
        409,
      );
    });

    test('trainer only sees own classes and clients, never financial or account data', async () => {
      const own = await request('/bootstrap', { cookie: trainerCookie });
      assert.equal(own.body.clients.length, 1);
      assert.equal(own.body.clients[0].id, clientId);
      assert.equal(
        own.body.classes.every((c) => c.instructor_id === trainerId),
        true,
      );
      assert.deepEqual(own.body.payments, []);
      assert.deepEqual(own.body.memberships, []);
      assert.deepEqual(own.body.plans, []);
      assert.deepEqual(own.body.users, []);
      assert.equal(own.body.settings.monthly_goal, undefined);
      const other = await request('/bootstrap', { cookie: otherTrainerCookie });
      assert.deepEqual(other.body.clients, []);
      assert.deepEqual(other.body.bookings, []);
      assert.equal(
        (
          await request(`/bookings/${bookingId}`, {
            method: 'PATCH',
            cookie: otherTrainerCookie,
            body: { status: 'attended' },
          })
        ).status,
        403,
      );
      assert.equal(
        (await request('/clients', { method: 'POST', cookie: trainerCookie, body: {} })).status,
        403,
      );
      assert.equal(
        (await request('/memberships', { method: 'POST', cookie: trainerCookie, body: {} })).status,
        403,
      );
      assert.equal(
        (await request('/classes', { method: 'POST', cookie: trainerCookie, body: {} })).status,
        403,
      );
      assert.equal(
        (await request('/settings', { method: 'PATCH', cookie: adminCookie, body: {} })).status,
        403,
      );
      assert.equal(
        (await request('/users', { method: 'POST', cookie: adminCookie, body: {} })).status,
        403,
      );
      assert.equal(
        (
          await request(`/bookings/${bookingId}`, {
            method: 'PATCH',
            cookie: trainerCookie,
            body: { status: 'cancelled' },
          })
        ).status,
        403,
      );
    });

    test('trainer attendance consumes exactly one visit even if submitted twice', async () => {
      assert.equal(
        (
          await request(`/bookings/${bookingId}`, {
            method: 'PATCH',
            cookie: trainerCookie,
            body: { status: 'attended' },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/bookings/${bookingId}`, {
            method: 'PATCH',
            cookie: trainerCookie,
            body: { status: 'attended' },
          })
        ).status,
        200,
      );
      const boot = await request('/bootstrap');
      const membership = boot.body.memberships.find((m) => m.id === membershipId);
      assert.equal(membership.remaining, 0);
      assert.equal(membership.reserved, 0);
      assert.equal(
        (
          await request(`/bookings/${bookingId}`, {
            method: 'PATCH',
            body: { status: 'cancelled' },
          })
        ).status,
        409,
      );
      assert.equal(
        (await request(`/classes/${classId}/cancel`, { method: 'POST', body: {} })).status,
        400,
      );
    });

    test('cancelling a future class releases reservations without consuming credit', async () => {
      const klass = await request('/classes', {
        method: 'POST',
        body: {
          title: 'Пилатес',
          type: 'pilates',
          instructor_id: trainerId,
          date: shiftDate(today(), 1),
          time: '09:00',
          duration: 55,
          capacity: 8,
        },
      });
      const sale = await request('/memberships', {
        method: 'POST',
        body: { client_id: clientId, plan_id: planId, method: 'transfer' },
      });
      const booking = await request('/bookings', {
        method: 'POST',
        body: { class_id: klass.body.id, client_id: clientId, membership_id: sale.body.id },
      });
      assert.equal(booking.status, 201);
      assert.equal(
        (
          await request(`/bookings/${booking.body.id}`, {
            method: 'PATCH',
            body: { status: 'attended' },
          })
        ).status,
        400,
      );
      assert.equal(
        (await request(`/classes/${klass.body.id}/cancel`, { method: 'POST', body: {} })).status,
        200,
      );
      const boot = await request('/bootstrap');
      assert.equal(boot.body.memberships.find((m) => m.id === sale.body.id).remaining, 1);
      assert.equal(boot.body.memberships.find((m) => m.id === sale.body.id).reserved, 0);
      assert.equal(boot.body.bookings.find((b) => b.id === booking.body.id).status, 'cancelled');
      assert.equal(
        (
          await request('/bookings', {
            method: 'POST',
            body: { class_id: klass.body.id, client_id: clientId, membership_id: sale.body.id },
          })
        ).status,
        404,
      );
    });

    test('cross-site writes are rejected and logout revokes the session', async () => {
      assert.equal(
        (
          await request('/clients', {
            method: 'POST',
            headers: { Origin: 'https://unrelated.example' },
            body: { name: 'Cross-site', phone: '+79999999999' },
          })
        ).status,
        403,
      );
      assert.equal(
        (await request('/auth/logout', { method: 'POST', cookie: trainerCookie, body: {} })).status,
        200,
      );
      assert.equal((await request('/bootstrap', { cookie: trainerCookie })).status, 401);
    });
  },
);

test('SQLite persists studio data across process reopen; demo seed is not repeated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'linia-persistence-'));
  try {
    const path = join(dir, 'studio.sqlite');
    let db = openDatabase(path, true);
    const before = db.prepare('SELECT count(*) AS n FROM clients').get().n;
    db.prepare("UPDATE settings SET value='Моя студия' WHERE key='studio_name'").run();
    db.close();
    db = openDatabase(path, true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM clients').get().n, before);
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key='studio_name'").get().value,
      'Моя студия',
    );
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
