import { useState } from 'react';
import { Plus, Filter, Download, Settings2, Archive } from 'lucide-react';
import { Field } from './components';
import { money, dateLabel, downloadCsv } from './lib';
import type { Data, Modal, Mutate } from './types';
const defaultFilters = {
  query: '',
  gender: '',
  minAge: '',
  maxAge: '',
  unknownAge: false,
  status: '',
  city: '',
  tag: '',
  source: '',
  manager: '',
  from: '',
  to: '',
  visitFrom: '',
  visitTo: '',
  minLtv: '',
  maxLtv: '',
  plan: '',
  noTasks: false,
};
const columnLabels = {
  id: 'Номер клиента',
  status: 'Статус клиента',
  ltv: 'LTV',
  plan: 'Абонемент',
  start: 'Дата начала',
  end: 'Дата окончания',
  visits: 'Остаток занятий',
  phone: 'Контакт',
  manager: 'Менеджер',
  last: 'Последнее посещение',
  source: 'Источник',
};
type Column = keyof typeof columnLabels;
export default function ClientDirectory({
  data,
  open,
  mutate,
  initialSearch = '',
}: {
  data: Data;
  open: (m: Modal) => void;
  mutate: Mutate;
  initialSearch?: string;
}) {
  const [filters, setFilters] = useState({ ...defaultFilters, query: initialSearch }),
    [applied, setApplied] = useState(filters),
    [showFilters, setShowFilters] = useState(true),
    [archived, setArchived] = useState(false),
    [columns, setColumns] = useState<Column[]>([
      'id',
      'status',
      'ltv',
      'plan',
      'start',
      'end',
      'phone',
      'manager',
    ]),
    [configure, setConfigure] = useState(false),
    [selected, setSelected] = useState<number[]>([]),
    [page, setPage] = useState(1),
    [size, setSize] = useState(25),
    [sort, setSort] = useState('name'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const rows = data.clients
    .map((c) => {
      const members = data.memberships
        .filter((m) => m.client_id === c.id)
        .sort((a, b) => b.end_date.localeCompare(a.end_date) || b.id - a.id);
      const active = members.find(
          (m) => m.start_date <= data.today && m.end_date >= data.today && m.remaining > 0,
        ),
        future = members.find((m) => m.start_date > data.today && m.remaining > 0),
        membership = active || future || members[0];
      const ltv = data.payments
        .filter((p) => p.client_id === c.id)
        .reduce((a, p) => a + p.amount, 0);
      const age = c.birthday
        ? Number(data.today.slice(0, 4)) -
          Number(c.birthday.slice(0, 4)) -
          (data.today.slice(5) < c.birthday.slice(5) ? 1 : 0)
        : null;
      const visits = data.bookings
        .filter((b) => b.client_id === c.id && b.status === 'attended')
        .map((b) => data.classes.find((k) => k.id === b.class_id)?.date || '')
        .sort();
      return {
        ...c,
        membership,
        ltv,
        age,
        last: visits.at(-1) || '',
        status: active ? 'active' : future ? 'future' : members.length ? 'expired' : 'new',
      };
    })
    .filter(
      (c) =>
        Boolean(c.archived_at) === archived &&
        `${c.name} ${c.phone} ${c.email} ${c.id}`
          .toLowerCase()
          .includes(applied.query.toLowerCase()) &&
        (!applied.gender || c.gender === applied.gender) &&
        (!applied.unknownAge || c.age === null) &&
        (!applied.minAge || (c.age !== null && c.age >= Number(applied.minAge))) &&
        (!applied.maxAge || (c.age !== null && c.age <= Number(applied.maxAge))) &&
        (!applied.status || c.status === applied.status) &&
        (!applied.city || c.city.toLowerCase().includes(applied.city.toLowerCase())) &&
        (!applied.tag || c.tags.toLowerCase().includes(applied.tag.toLowerCase())) &&
        (!applied.source || c.source === applied.source) &&
        (!applied.manager || String(c.manager_id) === applied.manager) &&
        (!applied.from || c.created_at >= applied.from) &&
        (!applied.to || c.created_at.slice(0, 10) <= applied.to) &&
        (!applied.visitFrom || c.last >= applied.visitFrom) &&
        (!applied.visitTo || (c.last !== '' && c.last <= applied.visitTo)) &&
        (!applied.minLtv || c.ltv >= Number(applied.minLtv)) &&
        (!applied.maxLtv || c.ltv <= Number(applied.maxLtv)) &&
        (!applied.plan ||
          data.memberships.some(
            (m) => m.client_id === c.id && String(m.plan_id) === applied.plan,
          )) &&
        (!applied.noTasks || !data.tasks.some((t) => t.client_id === c.id && t.status === 'open')),
    )
    .sort((a, b) =>
      sort === 'ltv'
        ? b.ltv - a.ltv
        : sort === 'new'
          ? b.id - a.id
          : a.name.localeCompare(b.name, 'ru'),
    );
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    current = Math.min(page, pages),
    displayed = rows.slice((current - 1) * size, current * size);
  function f<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((s) => ({ ...s, [key]: value }));
  }
  const statusName = (s: string) =>
    (
      ({ active: 'Открыт', future: 'Ожидает начала', expired: 'Завершён', new: 'Новый' }) as Record<
        string,
        string
      >
    )[s];
  async function archive() {
    setBusy(true);
    setError('');
    try {
      for (const id of selected)
        await mutate(
          `/clients/${id}/archive`,
          'PATCH',
          { archived: !archived },
          archived ? 'Клиент возвращён из архива' : 'Клиент перемещён в архив',
        );
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="clients-directory">
      <div className="report-title">
        <div>
          <h1>Клиенты</h1>
          <p>База клиентов вашей студии</p>
        </div>
      </div>
      <div className="leads-toolbar">
        <button className="button report-apply" onClick={() => open({ type: 'client-form' })}>
          <Plus size={16} />
          Добавить клиента
        </button>
        <button
          className="button"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <Filter size={15} />
          Фильтры
        </button>
        <span className="toolbar-spacer" />
        <button
          className="button"
          onClick={() =>
            downloadCsv('клиенты.csv', [
              [
                'ФИО',
                'Номер',
                'Статус',
                'LTV',
                'Абонемент',
                'Начало',
                'Окончание',
                'Контакт',
                'Менеджер',
                'Источник',
              ],
              ...rows.map((c) => [
                c.name,
                c.id,
                statusName(c.status),
                c.ltv,
                c.membership?.name || '',
                c.membership?.start_date || '',
                c.membership?.end_date || '',
                c.phone,
                data.staff.find((u) => u.id === c.manager_id)?.name || '',
                c.source,
              ]),
            ])
          }
        >
          <Download size={15} />
          CSV
        </button>
        <button
          className="button"
          onClick={() => setConfigure(!configure)}
          aria-expanded={configure}
        >
          <Settings2 size={15} />
          Настроить столбцы
        </button>
        <button
          className={`button ${archived ? 'selected' : ''}`}
          aria-pressed={archived}
          onClick={() => {
            setArchived(!archived);
            setSelected([]);
            setPage(1);
          }}
        >
          <Archive size={15} />
          {archived ? 'Вернуться к клиентам' : 'Архив'}
        </button>
      </div>
      {configure && (
        <div className="column-picker">
          {Object.entries(columnLabels).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={columns.includes(key as Column)}
                onChange={(e) =>
                  setColumns((old) =>
                    e.target.checked ? [...old, key as Column] : old.filter((c) => c !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
      )}
      {showFilters && (
        <form
          className="client-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ ...filters });
            setPage(1);
            setSelected([]);
          }}
        >
          <div className="lead-filters">
            <Field label="Информация о клиенте">
              <input
                value={filters.query}
                onChange={(e) => f('query', e.target.value)}
                placeholder="ФИО, телефон, email или номер"
              />
            </Field>
            <Field label="Пол">
              <select value={filters.gender} onChange={(e) => f('gender', e.target.value)}>
                <option value="">Все</option>
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
                <option value="unknown">Не указан</option>
              </select>
            </Field>
            <Field label="Возраст от">
              <input
                type="number"
                min="0"
                max="126"
                value={filters.minAge}
                onChange={(e) => f('minAge', e.target.value)}
              />
            </Field>
            <Field label="Возраст до">
              <input
                type="number"
                min="0"
                max="126"
                value={filters.maxAge}
                onChange={(e) => f('maxAge', e.target.value)}
              />
            </Field>
            <Field label="Статус">
              <select value={filters.status} onChange={(e) => f('status', e.target.value)}>
                <option value="">Все</option>
                {['new', 'active', 'future', 'expired'].map((s) => (
                  <option key={s} value={s}>
                    {statusName(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Менеджер">
              <select value={filters.manager} onChange={(e) => f('manager', e.target.value)}>
                <option value="">Все</option>
                {data.staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Город">
              <input value={filters.city} onChange={(e) => f('city', e.target.value)} />
            </Field>
            <Field label="Теги">
              <input value={filters.tag} onChange={(e) => f('tag', e.target.value)} />
            </Field>
            <Field label="Рекламный источник">
              <select value={filters.source} onChange={(e) => f('source', e.target.value)}>
                <option value="">Все</option>
                {[...new Set(data.clients.map((c) => c.source))].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Абонемент">
              <select value={filters.plan} onChange={(e) => f('plan', e.target.value)}>
                <option value="">Все</option>
                {data.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {(
              [
                ['from', 'Регистрация с'],
                ['to', 'Регистрация по'],
                ['visitFrom', 'Последнее посещение с'],
                ['visitTo', 'Последнее посещение по'],
              ] as const
            ).map(([key, label]) => (
              <Field label={label} key={key}>
                <input type="date" value={filters[key]} onChange={(e) => f(key, e.target.value)} />
              </Field>
            ))}
            {(
              [
                ['minLtv', 'LTV от, ₽'],
                ['maxLtv', 'LTV до, ₽'],
              ] as const
            ).map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  type="number"
                  min="0"
                  value={filters[key]}
                  onChange={(e) => f(key, e.target.value)}
                />
              </Field>
            ))}
            <label className="check-filter">
              <input
                type="checkbox"
                checked={filters.unknownAge}
                onChange={(e) => f('unknownAge', e.target.checked)}
              />
              Возраст не указан
            </label>
            <label className="check-filter">
              <input
                type="checkbox"
                checked={filters.noTasks}
                onChange={(e) => f('noTasks', e.target.checked)}
              />
              Без открытых задач
            </label>
          </div>
          <div className="filter-footer">
            <button className="button report-apply" type="submit">
              Применить
            </button>
            <button
              className="button"
              type="button"
              onClick={() => {
                setFilters({ ...defaultFilters });
                setApplied({ ...defaultFilters });
                setPage(1);
                setSelected([]);
              }}
            >
              Очистить фильтр
            </button>
          </div>
        </form>
      )}
      <div className="leads-toolbar">
        <span>
          {archived ? 'Архив · ' : ''}Найдено: {rows.length}
        </span>
        <span className="toolbar-spacer" />
        <label>
          Сортировка{' '}
          <select
            aria-label="Сортировка клиентов"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">По имени</option>
            <option value="new">Новые сначала</option>
            <option value="ltv">По LTV</option>
          </select>
        </label>
        {selected.length > 0 && (
          <button className="button" disabled={busy} onClick={() => void archive()}>
            {archived ? 'Восстановить' : 'В архив'} ({selected.length})
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="report-panel report-table-wrap">
        <table className="directory-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Выбрать страницу клиентов"
                  checked={displayed.length > 0 && displayed.every((c) => selected.includes(c.id))}
                  onChange={(e) => setSelected(e.target.checked ? displayed.map((c) => c.id) : [])}
                />
              </th>
              <th>ФИО</th>
              {columns.map((c) => (
                <th key={c}>{columnLabels[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((c) => (
              <tr key={c.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Выбрать ${c.name}`}
                    checked={selected.includes(c.id)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked ? [...old, c.id] : old.filter((id) => id !== c.id),
                      )
                    }
                  />
                </td>
                <td>
                  <button className="table-link" onClick={() => open({ type: 'client', id: c.id })}>
                    {c.name}
                  </button>
                </td>
                {columns.map((col) => (
                  <td key={col}>
                    {col === 'id' ? (
                      `ЛН${String(c.id).padStart(6, '0')}`
                    ) : col === 'status' ? (
                      <span className={`client-status ${c.status}`}>{statusName(c.status)}</span>
                    ) : col === 'ltv' ? (
                      money(c.ltv)
                    ) : col === 'plan' ? (
                      c.membership?.name || '—'
                    ) : col === 'start' ? (
                      c.membership ? (
                        dateLabel(c.membership.start_date)
                      ) : (
                        '—'
                      )
                    ) : col === 'end' ? (
                      c.membership ? (
                        dateLabel(c.membership.end_date)
                      ) : (
                        '—'
                      )
                    ) : col === 'visits' ? (
                      (c.membership?.remaining ?? '—')
                    ) : col === 'phone' ? (
                      c.phone
                    ) : col === 'manager' ? (
                      data.staff.find((u) => u.id === c.manager_id)?.name || '—'
                    ) : col === 'last' ? (
                      c.last ? (
                        dateLabel(c.last)
                      ) : (
                        '—'
                      )
                    ) : (
                      c.source
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="chart-empty">Клиенты не найдены</p>}
        <div className="pagination">
          <select
            aria-label="Клиентов на странице"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <span>Всего {rows.length} записей</span>
          <span className="toolbar-spacer" />
          <button className="button" disabled={current === 1} onClick={() => setPage(current - 1)}>
            Назад
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            className="button"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            Далее
          </button>
        </div>
      </section>
    </div>
  );
}
