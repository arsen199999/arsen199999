import { chromium } from 'playwright';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { openDatabase, today, shiftDate } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
const dir = mkdtempSync(join(tmpdir(), 'linia-workspace-')),
  db = openDatabase(join(dir, 'test.sqlite'), true);
const server = createApp(db).listen(0, '127.0.0.1');
await once(server, 'listening');
let browser, page;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  });
  page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    reducedMotion: 'reduce',
    locale: 'ru-RU',
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: 'Войти как владелец' }).click();
  const nav = (name) => page.locator('.sidebar nav').getByRole('button', { name, exact: true });
  await page.getByText('Фактическая выручка', { exact: true }).waitFor();
  for (const tab of ['Продажи', 'Клиенты', 'Занятия', 'Маркетинг', 'Общие']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByRole('tabpanel', { name: tab, exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'Добавить расход', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Описание', { exact: true }).fill('Аренда тест');
  await dialog.getByLabel('Сумма, ₽', { exact: true }).fill('1000');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('cell', { name: 'Аренда тест', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Продать услугу / товар', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Клиент', exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('Описание', { exact: true }).fill('Персональная тренировка');
  await dialog.getByLabel('Стоимость, ₽', { exact: true }).fill('2000');
  await dialog.getByLabel('Получено, ₽').fill('500');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'Персональная тренировка' })
    .getByRole('button', { name: 'Принять оплату' })
    .click();
  dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Сумма, ₽', { exact: true }).inputValue(), '1500');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByText('Задолженностей нет', { exact: true }).waitFor();
  await page.getByLabel('Период с', { exact: true }).fill(shiftDate(today(), -1));
  await page.getByLabel('По', { exact: true }).fill(shiftDate(today(), -1));
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await page.getByText('Расходы не внесены', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Этот месяц' }).click();
  console.log(
    'PASS: five report tabs, real expense, partial payment, debt collection and period filter.',
  );
  await nav('Заявки').click();
  await page.getByRole('button', { name: 'Создать воронку' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название воронки', { exact: true }).fill('Пробные занятия');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Воронка', exact: true })
    .selectOption({ label: 'Пробные занятия' });
  await page.getByRole('button', { name: 'Создать заявку', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Имя', { exact: true }).fill('Марина тест');
  await dialog.getByLabel('Телефон', { exact: true }).fill('89995553322');
  await dialog.getByLabel('Источник', { exact: true }).fill('ВКонтакте');
  await dialog.getByLabel('Сумма сделки, ₽').fill('7200');
  await dialog.getByLabel('Теги через запятую').fill('Пробное');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Этап заявки Марина тест', exact: true })
    .selectOption({ label: 'В работе' });
  await page
    .getByRole('region', { name: 'В работе', exact: true })
    .getByText('Марина тест', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: /ВКонтакте.*Марина тест/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Создать / связать клиента' }).click();
  await page
    .getByRole('dialog')
    .getByRole('heading', { name: 'Марина тест', exact: true })
    .waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  const card = page.locator('.lead-card').filter({ hasText: 'Марина тест' });
  await card.dragTo(page.getByRole('region', { name: 'Успешно', exact: true }));
  await page
    .getByRole('region', { name: 'Успешно', exact: true })
    .getByText('Марина тест', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Список', exact: true }).click();
  await page.getByRole('cell', { name: 'Марина тест', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Колонки', exact: true }).click();
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/leads-desktop.png', fullPage: true });
  console.log(
    'PASS: create funnel and lead, select/move stage, drag card, link client, switch list.',
  );
  await nav('Задачи').click();
  await page.getByRole('button', { name: 'Создать задачу', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название задачи').fill('Позвонить Марине');
  await dialog
    .getByRole('combobox', { name: 'Клиент', exact: true })
    .selectOption({ label: 'Марина тест' });
  await dialog
    .getByRole('combobox', { name: 'Заявка', exact: true })
    .selectOption({ label: 'Марина тест · ВКонтакте' });
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Перенести / изменить' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Дата задачи').fill(shiftDate(today(), 1));
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page
    .locator('.task-column')
    .filter({ has: page.getByRole('heading', { name: /Завтра/ }) })
    .getByRole('heading', { name: 'Позвонить Марине' })
    .waitFor();
  await page.screenshot({ path: 'test-results/tasks-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Выполнить', exact: true }).click();
  await page.getByLabel('Выполненные', { exact: true }).check();
  await page.getByRole('heading', { name: 'Позвонить Марине', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Вернуть в работу' }).click();
  await page.getByLabel('Выполненные', { exact: true }).uncheck();
  console.log('PASS: create and reschedule task, complete and reopen.');
  await nav('Клиенты').click();
  await page.getByLabel('Информация о клиенте').fill('Марина тест');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await page.getByRole('button', { name: 'Марина тест', exact: true }).waitFor();
  await page.getByLabel('Выбрать Марина тест', { exact: true }).check();
  await page.getByRole('button', { name: 'В архив (1)', exact: true }).click();
  await page.getByText('Клиенты не найдены', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Архив', exact: true }).click();
  await page.getByRole('button', { name: 'Марина тест', exact: true }).waitFor();
  await page.getByLabel('Выбрать Марина тест', { exact: true }).check();
  await page.getByRole('button', { name: 'Восстановить (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Вернуться к клиентам', exact: true }).click();
  await page.getByRole('button', { name: 'Очистить фильтр' }).click();
  await page.screenshot({ path: 'test-results/clients-desktop.png', fullPage: true });
  await nav('График и расписание').hover();
  for (const name of [
    'Расписание',
    'График дежурств',
    'График работы тренеров',
    'График работы залов',
    'Записи',
  ])
    await page.locator('#schedule-submenu').getByRole('button', { name, exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/schedule-menu.png', fullPage: true });
  await page
    .locator('#schedule-submenu')
    .getByRole('button', { name: 'График дежурств', exact: true })
    .click();
  await page.getByRole('button', { name: 'Добавить дежурство' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('cell', { name: '09:00', exact: true }).waitFor();
  console.log('PASS: client filters and archive recovery; schedule flyout and duty creation.');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Заявки', 'Задачи', 'Клиенты']) {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await nav(name).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${name} fits mobile`,
    );
  }
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await nav('График и расписание').click();
  await page
    .locator('#schedule-submenu')
    .getByRole('button', { name: 'Расписание', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Расписание.', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Рабочий стол', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  console.log('PASS: new views on mobile, persisted data and no browser errors.');
} catch (e) {
  if (page) {
    await page.screenshot({ path: 'test-results/workspace-failure.png', fullPage: true });
    console.error(await page.locator('body').ariaSnapshot());
  }
  throw e;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
