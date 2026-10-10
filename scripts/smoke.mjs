import { chromium } from 'playwright';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { openDatabase } from '../server/db.mjs';

if (!existsSync(resolve('dist/index.html'))) throw new Error('Run npm run build first.');
const dir = mkdtempSync(join(tmpdir(), 'linia-browser-'));
const db = openDatabase(join(dir, 'test.sqlite'), true);
const server = createApp(db).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync('test-results', { recursive: true });
let browser, page;
try {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Войти как владелец' }).click();
  await page.getByRole('heading', { name: 'Обзор студии.' }).waitFor();
  await page.screenshot({
    path: 'test-results/dashboard-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  console.log('PASS: owner login and dashboard.');

  await page.getByRole('button', { name: 'Клиенты', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить клиента', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Имя и фамилия *').fill('Тестовая Анастасия');
  await dialog.getByLabel('Телефон *').fill('+79998887766');
  await dialog.getByLabel('Заметка').fill('Проверка полного рабочего сценария');
  await dialog.getByRole('button', { name: 'Добавить клиента', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Тестовая Анастасия' }).waitFor();
  await dialog.getByRole('button', { name: 'Новый абонемент', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Абонемент *', exact: true })
    .selectOption({ label: 'Пробное занятие · 1 зан. · 700 ₽' });
  await dialog.getByRole('button', { name: 'Оформить и записать оплату' }).click();
  await dialog.getByRole('heading', { name: 'Тестовая Анастасия' }).waitFor();
  await dialog.getByText('Активен', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  console.log('PASS: create client, sell membership, record payment.');

  await page.getByRole('button', { name: /^Расписание/ }).click();
  await page.getByRole('button', { name: 'Добавить занятие', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название занятия *').fill('Тестовая растяжка');
  await dialog.getByLabel('Тренер *').selectOption({ label: 'Анна Миронова' });
  await dialog.getByLabel('Время *').fill('08:00');
  await dialog.getByLabel('Зал', { exact: true }).fill('Тестовый зал');
  await dialog.getByRole('button', { name: 'Добавить занятие', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Тестовая растяжка', exact: true }).waitFor();
  await dialog
    .getByRole('combobox', { name: 'Клиент', exact: true })
    .selectOption({ label: 'Тестовая Анастасия · +79998887766' });
  await dialog.getByRole('button', { name: 'Записать на занятие' }).click();
  await dialog.getByRole('button', { name: 'Посещение', exact: true }).click();
  await dialog.getByText('Посетил(а)', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  console.log('PASS: create class, book client, mark attendance.');

  await page.getByRole('button', { name: 'Неделя', exact: true }).click();
  await page.screenshot({
    path: 'test-results/schedule-week.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Финансы', exact: true }).click();
  await page.getByRole('heading', { name: 'История оплат' }).waitFor();
  await page.getByRole('cell', { name: 'Тестовая Анастасия' }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Выгрузить отчёт' }).click();
  assert.ok((await download).suggestedFilename().endsWith('.csv'));
  console.log('PASS: weekly schedule, financial ledger and CSV export.');

  await page.getByRole('button', { name: 'Настройки студии', exact: true }).click();
  await page.getByLabel('Название студии', { exact: true }).fill('Линия тест');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await page.getByRole('status').filter({ hasText: 'Настройки студии сохранены' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Обзор студии.' }).waitFor();
  assert.equal(await page.locator('.studio-switch strong').textContent(), 'Линия тест');
  console.log('PASS: settings persisted after reload.');

  await page.getByRole('button', { name: 'Команда', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить сотрудника', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Имя и фамилия *').fill('Новый тренер');
  await dialog.getByLabel('Email для входа *').fill('new-trainer@example.test');
  await dialog.getByLabel('Пароль *').fill('Test-Password-123');
  await dialog.getByRole('button', { name: 'Добавить сотрудника', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Учётная запись сотрудника создана' }).waitFor();
  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await page.getByLabel('Email', { exact: true }).fill('new-trainer@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('Test-Password-123');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой день.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Финансы', exact: true }).count(), 0);
  assert.equal(
    await page.getByRole('button', { name: 'Настройки студии', exact: true }).count(),
    0,
  );
  console.log('PASS: employee creation, password login and trainer interface restrictions.');

  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await page.getByRole('button', { name: 'Войти как владелец' }).click();
  await page.getByRole('heading', { name: 'Обзор студии.' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/dashboard-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('button', { name: 'Клиенты', exact: true }).click();
  await page.getByRole('textbox', { name: 'Имя или телефон' }).fill('Тестовая Анастасия');
  await page.getByRole('button', { name: /Тестовая Анастасия Студия/ }).click();
  await page.getByRole('dialog').getByText('Завершён', { exact: true }).waitFor();
  await page.screenshot({
    path: 'test-results/client-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  console.log(
    'PASS: mobile navigation, client search, exhausted membership and no browser errors.',
  );
  console.log('All browser smoke checks passed. Screenshots: test-results/');
} catch (error) {
  if (page) {
    await page.screenshot({
      path: 'test-results/failure.png',
      fullPage: true,
      animations: 'disabled',
    });
    console.error(
      await (
        (await page.getByRole('dialog').count()) ? page.getByRole('dialog') : page.locator('main')
      ).ariaSnapshot(),
    );
  }
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
