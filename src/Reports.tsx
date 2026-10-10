import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Download } from 'lucide-react';
import { api, money, methods, shiftDate, dateLabel, downloadCsv } from './lib';
import { Field, ModalFrame, Submit } from './components';
import { Metric, ChartPanel, Bars, Donut, RevenueChart, number, pct } from './ReportCharts';
import type { Data, Modal, Mutate, Report, Sale } from './types';
const tabs = ['Общие', 'Продажи', 'Клиенты', 'Занятия', 'Маркетинг'];
const categoryNames: Record<string, string> = {
  membership: 'Абонементы',
  service: 'Услуги',
  product: 'Товары',
};
export default function Reports({
  data,
  mutate,
  open,
}: {
  data: Data;
  mutate: Mutate;
  open: (m: Modal) => void;
}) {
  const month = data.today.slice(0, 7) + '-01';
  const [tab, setTab] = useState('Общие'),
    [from, setFrom] = useState(month),
    [to, setTo] = useState(data.today);
  const [range, setRange] = useState({ from: month, to: data.today });
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'expense' | 'sale' | Sale | null>(null);
  const close = useCallback(() => setAction(null), []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void api<Report>(`/reports?from=${range.from}&to=${range.to}`)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, range]);
  const r = report;
  function preset(start: string, end: string) {
    setFrom(start);
    setTo(end);
    setRange({ from: start, to: end });
  }
  return (
    <div className="reports-page">
      <div className="report-title">
        <div>
          <h1>Рабочий стол</h1>
          <p>{data.settings.studio_name} · показатели студии</p>
        </div>
        <div className="report-actions">
          <button className="button" onClick={() => setAction('expense')}>
            Добавить расход
          </button>
          <button className="button" onClick={() => setAction('sale')}>
            Продать услугу / товар
          </button>
          <button className="button primary" onClick={() => open({ type: 'sale' })}>
            <Plus size={16} />
            Абонемент
          </button>
        </div>
      </div>
      <div className="report-tabs" role="tablist" aria-label="Показатели студии">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <form
        className="report-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ from, to });
        }}
      >
        <Field label="Период с">
          <input
            type="date"
            value={from}
            min="2000-01-01"
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </Field>
        <Field label="По">
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </Field>
        <button className="button report-apply" type="submit">
          Применить
        </button>
        <button className="button" type="button" onClick={() => preset(month, data.today)}>
          Этот месяц
        </button>
        <button
          className="button"
          type="button"
          onClick={() => preset(shiftDate(data.today, -29), data.today)}
        >
          30 дней
        </button>
        <button
          className="button"
          type="button"
          onClick={() => preset(data.today.slice(0, 4) + '-01-01', data.today)}
        >
          Год
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="report-loading">
          Обновляем показатели…
        </p>
      ) : (
        r &&
        !error && (
          <div role="tabpanel" aria-label={tab}>
            <p className="report-period">
              {dateLabel(r.from)} — {dateLabel(r.to)} · остатки и задолженности на{' '}
              {dateLabel(r.as_of)}
            </p>
            {tab === 'Общие' && (
              <>
                <div className="metrics-grid">
                  <Metric
                    label="Общая выручка"
                    value={money(r.overview.revenue)}
                    hint="Фактически полученные оплаты за выбранный период, включая погашение старых долгов."
                  />
                  <Metric
                    label="Расходы"
                    value={money(r.overview.expenses)}
                    hint="Расходы, внесённые в CRM за выбранный период."
                  />
                  <Metric
                    label="Задолженность за период"
                    value={money(r.overview.debt_period)}
                    hint="Неоплаченный остаток продаж, созданных в периоде, на дату отчёта."
                  />
                  <Metric
                    label="Итоговая задолженность"
                    value={money(r.overview.debt_total)}
                    hint="Долги по всем продажам на дату отчёта."
                  />
                  <Metric
                    label="Активные клиенты"
                    value={number(r.overview.active_clients)}
                    hint="Клиенты с действующим абонементом и оставшимися занятиями на дату отчёта."
                  />
                  <Metric
                    label="Заканчиваются абонементы"
                    value={number(r.overview.expiring_memberships)}
                    hint="Активные абонементы: осталось до 7 дней или не более 2 занятий."
                  />
                  <Metric
                    label="Закончились абонементы"
                    value={number(r.overview.ended_memberships)}
                    hint="В периоде закончился срок или использовано последнее занятие."
                  />
                  <Metric
                    label="Процент продления абонементов"
                    value={pct(r.overview.renewal_rate)}
                    hint="Доля закончившихся абонементов, для которых куплен следующий с началом не позже 30 дней после окончания. Покупки учитываются до даты отчёта."
                  />
                  <Metric label="Новые регистрации" value={number(r.overview.registrations)} />
                  <Metric
                    label="Установлено приложений"
                    value="Не подключено"
                    hint="Клиентское приложение пока не подключено. Установки не отслеживаются."
                  />
                  <Metric
                    label="Посещения"
                    value={number(r.overview.visits)}
                    hint="Отмеченные посещения занятий, прошедших в выбранном периоде."
                  />
                  <Metric
                    label="Выручка минус расходы"
                    value={money(r.overview.net)}
                    hint="Денежный результат периода; не является расчётом бухгалтерской прибыли."
                  />
                </div>
                <ChartPanel title="Фактическая выручка">
                  <RevenueChart days={r.daily} />
                </ChartPanel>
                <ChartPanel title="Накопительная выручка">
                  <RevenueChart days={r.daily} cumulative />
                </ChartPanel>
                <ChartPanel title="Задолженности">
                  <p className="report-note">
                    Остатки на {dateLabel(r.as_of)}. Приём оплаты доступен для текущих долгов.
                  </p>
                  <div className="report-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Клиент</th>
                          <th>Покупка</th>
                          <th>Стоимость</th>
                          <th>Оплачено</th>
                          <th>Долг</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {r.debts.map((s) => (
                          <tr key={s.id}>
                            <td>{s.client_name}</td>
                            <td>{s.description}</td>
                            <td>{money(s.total)}</td>
                            <td>{money(s.paid)}</td>
                            <td>{money(s.debt)}</td>
                            <td>
                              {data.sales.find((a) => a.id === s.id)!.debt > 0 && (
                                <button
                                  className="button small"
                                  onClick={() => setAction(data.sales.find((a) => a.id === s.id)!)}
                                >
                                  Принять оплату
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!r.debts.length && <p className="chart-empty">Задолженностей нет</p>}
                  </div>
                </ChartPanel>
                <ChartPanel title="Расходы за период">
                  <div className="report-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Описание</th>
                          <th>Категория</th>
                          <th>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.expenses.map((e) => (
                          <tr key={e.id}>
                            <td>{dateLabel(e.date)}</td>
                            <td>{e.description}</td>
                            <td>{e.category}</td>
                            <td>{money(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!r.expenses.length && <p className="chart-empty">Расходы не внесены</p>}
                  </div>
                </ChartPanel>
              </>
            )}
            {tab === 'Продажи' && (
              <>
                <div className="metrics-grid three">
                  {r.sales.categories.map((c) => (
                    <Metric
                      key={c.category}
                      label={`Выручка: ${categoryNames[c.category].toLowerCase()}`}
                      value={money(c.revenue)}
                    />
                  ))}
                </div>
                <div className="metrics-grid three">
                  {r.sales.categories.map((c) => (
                    <Metric
                      key={c.category}
                      label={`Средний чек: ${categoryNames[c.category].toLowerCase()}`}
                      value={c.average_check === null ? '—' : money(c.average_check)}
                      hint="Стоимость продаж, оформленных в периоде, делённая на число продаж. Частичные оплаты не увеличивают число чеков."
                    />
                  ))}
                </div>
                <div className="report-grid three">
                  <ChartPanel title="Доли выручки абонементов">
                    <Donut
                      currency
                      rows={r.sales.membership_kinds.map((x) => ({
                        ...x,
                        name: (
                          { new: 'Новые', renewal: 'Продление', return: 'Возвращение' } as Record<
                            string,
                            string
                          >
                        )[x.name],
                      }))}
                    />
                    <p className="report-note">
                      Возвращение — покупка спустя более 30 дней после окончания предыдущего
                      абонемента.
                    </p>
                  </ChartPanel>
                  <ChartPanel title="Способы оплаты">
                    <Donut
                      currency
                      rows={r.sales.methods.map((x) => ({ ...x, name: methods[x.name] }))}
                    />
                  </ChartPanel>
                  <ChartPanel title="Доли выручки по предмету оплаты">
                    <Donut
                      currency
                      rows={r.sales.categories.map((c) => ({
                        name: categoryNames[c.category],
                        value: c.revenue,
                      }))}
                    />
                  </ChartPanel>
                </div>
                <div className="report-grid">
                  <ChartPanel title="Топ-10 абонементов по выручке">
                    <Bars currency rows={r.sales.top_plans} />
                  </ChartPanel>
                  <ChartPanel title="Топ менеджеров по абонементам">
                    <Bars currency rows={r.sales.top_sellers} />
                  </ChartPanel>
                </div>
              </>
            )}
            {tab === 'Клиенты' && (
              <>
                <div className="metrics-grid three">
                  <Metric
                    label="Средний возраст клиента"
                    value={
                      r.clients.average_age === null ? '—' : `${number(r.clients.average_age)} лет`
                    }
                    hint={`По заполненным датам рождения: ${r.clients.known_ages} клиентов.`}
                  />
                  <Metric
                    label="Посещений на 1 клиента"
                    value={number(r.clients.visits_per_client)}
                    hint="Посещения в периоде / все зарегистрированные клиенты на дату отчёта."
                  />
                  <Metric
                    label="LTV клиента"
                    value={r.clients.ltv === null ? '—' : money(r.clients.ltv)}
                    hint="Все полученные оплаты за историю до даты отчёта / все клиенты. Это фактическая средняя выручка, не прогноз."
                  />
                </div>
                <div className="report-grid">
                  <ChartPanel title="Возраст клиентов">
                    <Bars rows={r.clients.ages} />
                  </ChartPanel>
                  <ChartPanel title="Пол клиентов">
                    <Donut rows={r.clients.genders} />
                  </ChartPanel>
                  <ChartPanel title="Топ-10 клиентов по посещениям">
                    <Bars rows={r.clients.top_visitors} />
                  </ChartPanel>
                  <ChartPanel title="Топ-10 клиентов по LTV">
                    <Bars currency rows={r.clients.top_ltv} />
                  </ChartPanel>
                </div>
              </>
            )}
            {tab === 'Занятия' && (
              <>
                <div className="metrics-grid">
                  <Metric
                    label="Групповые занятия"
                    value={number(r.classes.count)}
                    hint="Все неотменённые занятия в периоде, в том числе запланированные."
                  />
                  <Metric
                    label="Доходимость"
                    value={pct(r.classes.attendance)}
                    hint="Отмеченные посещения / записи на уже завершившиеся занятия. Отменённые записи исключены."
                  />
                  <Metric
                    label="Заполненность"
                    value={pct(r.classes.occupancy)}
                    hint="Все неотменённые записи / общее число мест на занятиях в периоде, включая будущие."
                  />
                  <Metric label="Мест для записи" value={number(r.classes.capacity)} />
                </div>
                <div className="report-grid">
                  <ChartPanel title="Топ-10 групповых занятий">
                    <Bars rows={r.classes.top_classes} />
                  </ChartPanel>
                  <ChartPanel title="Топ-10 тренеров по числу занятий">
                    <Bars rows={r.classes.top_trainers} />
                  </ChartPanel>
                  <ChartPanel title="Заполненность групповых занятий">
                    <div className="report-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Название</th>
                            <th>Записи / места</th>
                            <th>Заполненность</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.classes.occupancy_by_class.map((c) => (
                            <tr key={c.name}>
                              <td>{c.name}</td>
                              <td>
                                {c.bookings} / {c.capacity}
                              </td>
                              <td>{pct(c.occupancy)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </ChartPanel>
                </div>
              </>
            )}
            {tab === 'Маркетинг' && (
              <>
                <div className="metrics-grid">
                  <Metric label="Все заявки" value={number(r.marketing.leads)} />
                  <Metric label="Заявки в архиве" value={number(r.marketing.archived)} />
                  <Metric label="Связаны с клиентами" value={number(r.marketing.converted)} />
                  <Metric
                    label="Конверсия в оплату"
                    value={pct(r.marketing.conversion)}
                    hint="Доля заявок периода с привязанным клиентом и оплатой до даты отчёта. Одна продажа относится к последней связанной заявке на момент продажи."
                  />
                </div>
                <div className="report-grid">
                  <ChartPanel title="Источники заявок">
                    <Donut rows={r.marketing.sources} />
                  </ChartPanel>
                  <ChartPanel title="Выручка по источникам">
                    <Donut
                      currency
                      rows={r.marketing.channels.map((c) => ({ name: c.name, value: c.revenue }))}
                    />
                  </ChartPanel>
                  <ChartPanel title="Эффективность рекламных каналов">
                    <div className="report-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Канал</th>
                            <th>Заявки</th>
                            <th>С оплатой</th>
                            <th>Конверсия</th>
                            <th>Выручка</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.marketing.channels.map((c) => (
                            <tr key={c.name}>
                              <td>{c.name}</td>
                              <td>{c.leads}</td>
                              <td>{c.converted}</td>
                              <td>{pct(c.conversion)}</td>
                              <td>{money(c.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="report-note">
                      Заявки учитываются по дате создания. Выручка — по дате оплаты. Расходы на
                      рекламу и ROI пока не рассчитываются.
                    </p>
                  </ChartPanel>
                </div>
              </>
            )}
            <button
              className="button"
              onClick={() =>
                downloadCsv(`выручка-${r.from}-${r.to}.csv`, [
                  ['Дата', 'Выручка', 'Расходы', 'Накопительная выручка'],
                  ...r.daily.map((d) => [d.date, d.revenue, d.expenses, d.cumulative]),
                ])
              }
            >
              <Download size={16} />
              Выгрузить выручку по дням
            </button>
          </div>
        )
      )}
      {action && (
        <MoneyForm
          key={typeof action === 'string' ? action : action.id}
          action={action}
          data={data}
          mutate={mutate}
          close={close}
        />
      )}
    </div>
  );
}
function MoneyForm({
  action,
  data,
  mutate,
  close,
}: {
  action: 'expense' | 'sale' | Sale;
  data: Data;
  mutate: Mutate;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const receipt = typeof action === 'object';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await mutate(
        receipt ? `/sales/${action.id}/payments` : action === 'expense' ? '/expenses' : '/sales',
        'POST',
        body,
        'Операция сохранена',
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame
      title={
        receipt
          ? 'Принять оплату'
          : action === 'expense'
            ? 'Новый расход'
            : 'Продажа услуги или товара'
      }
      onClose={close}
    >
      <form onSubmit={submit}>
        {receipt ? (
          <p>
            {action.description} · осталось {money(action.debt)}
          </p>
        ) : (
          <>
            {action === 'sale' && (
              <Field label="Клиент">
                <select name="client_id" required>
                  <option value="">Выберите клиента</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.phone}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Описание">
              <input name="description" required maxLength={150} />
            </Field>
            <Field label="Категория">
              {action === 'expense' ? (
                <input name="category" required defaultValue="Прочее" maxLength={60} />
              ) : (
                <select name="category">
                  <option value="service">Услуга</option>
                  <option value="product">Товар</option>
                </select>
              )}
            </Field>
          </>
        )}
        <div className="form-grid">
          <Field label={action === 'sale' ? 'Стоимость, ₽' : 'Сумма, ₽'}>
            <input
              type="number"
              name={action === 'sale' ? 'total' : 'amount'}
              min="1"
              max={receipt ? action.debt : 1000000}
              defaultValue={receipt ? action.debt : undefined}
              required
            />
          </Field>
          <Field label="Дата">
            <input
              type="date"
              name="date"
              min={receipt ? action.date : '2000-01-01'}
              max={data.today}
              defaultValue={data.today}
              required
            />
          </Field>
          {action === 'sale' && (
            <Field label="Получено, ₽">
              <input name="paid_amount" type="number" min="0" max="1000000" required />
              <small>Остаток будет учтён как долг.</small>
            </Field>
          )}
          {action !== 'expense' && (
            <Field label="Способ оплаты">
              <select name="method">
                {Object.entries(methods).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <button className="button" type="button" onClick={close}>
            Отмена
          </button>
          <Submit busy={busy} />
        </div>
      </form>
    </ModalFrame>
  );
}
