import { useState, type FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  ListFilter,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Avatar, Badge, Empty, Field, PanelTitle, SearchInput, Stat, Submit } from './components';
import {
  dateLabel,
  downloadCsv,
  endTime,
  methods,
  money,
  roleLabel,
  shiftDate,
  typeColors,
  typeNames,
} from './lib';
import type { Data, Modal, Page } from './types';

type PageProps = { data: Data; open: (m: Modal) => void };
export function Schedule({ data, open }: PageProps) {
  const [date, setDate] = useState(data.today);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [instructor, setInstructor] = useState('');
  const [type, setType] = useState('');
  const trainer = data.user.role === 'trainer';
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const monday = shiftDate(date, -weekday);
  const days = view === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const classes = data.classes.filter(
    (c) =>
      days.includes(c.date) &&
      (!instructor || c.instructor_id === Number(instructor)) &&
      (!type || c.type === type) &&
      c.status !== 'cancelled',
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ДВИЖЕНИЕ ПО ПЛАНУ</div>
          <h1>
            {trainer ? 'Моё расписание' : 'Расписание'}
            <span className="heading-dot">.</span>
          </h1>
          <p>Время для растяжки, баланса и хорошего самочувствия.</p>
        </div>
        {!trainer && (
          <button className="button primary" onClick={() => open({ type: 'class-form', date })}>
            <Plus size={18} />
            Добавить занятие
          </button>
        )}
      </div>
      <section className="panel schedule-panel">
        <div className="schedule-toolbar">
          <div className="date-nav">
            <button
              className="icon-button"
              aria-label="Предыдущий период"
              onClick={() => setDate(shiftDate(date, view === 'day' ? -1 : -7))}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Следующий период"
              onClick={() => setDate(shiftDate(date, view === 'day' ? 1 : 7))}
            >
              <ChevronRight size={19} />
            </button>
            <label className="date-picker">
              <CalendarDays size={17} />
              <input
                type="date"
                aria-label="Дата расписания"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </label>
            <button className="button small-button" onClick={() => setDate(data.today)}>
              Сегодня
            </button>
          </div>
          <div className="segmented">
            <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>
              День
            </button>
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
              Неделя
            </button>
          </div>
        </div>
        <div className="schedule-filters">
          <ListFilter size={17} />
          <select
            aria-label="Фильтр по тренеру"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
          >
            <option value="">Все тренеры</option>
            {data.instructors
              .filter((i) => !trainer || i.id === data.user.instructor_id)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
          <select
            aria-label="Фильтр по направлению"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Все направления</option>
            {Object.entries(typeNames).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <span>{classes.length} занятий</span>
        </div>
        {view === 'day' && (
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, i) => shiftDate(monday, i)).map((d) => (
              <button
                key={d}
                className={`${d === date ? 'selected' : ''} ${d === data.today ? 'is-today' : ''}`}
                onClick={() => setDate(d)}
              >
                <span>{dateLabel(d, { weekday: 'short' })}</span>
                <strong>{dateLabel(d, { day: 'numeric' })}</strong>
                <i />
              </button>
            ))}
          </div>
        )}
        <div className={view === 'week' ? 'week-grid' : 'day-grid'}>
          {days.map((d) => (
            <div className="schedule-day" key={d}>
              {view === 'week' && (
                <div className={`week-day-label ${d === data.today ? 'is-today' : ''}`}>
                  {dateLabel(d, { weekday: 'short' })}
                  <strong>{dateLabel(d, { day: 'numeric', month: 'short' })}</strong>
                </div>
              )}
              {classes.filter((c) => c.date === d).length ? (
                classes
                  .filter((c) => c.date === d)
                  .map((c) => {
                    const instructor = data.instructors.find((i) => i.id === c.instructor_id)!;
                    const count = data.bookings.filter(
                      (b) => b.class_id === c.id && b.status !== 'cancelled',
                    ).length;
                    return (
                      <button
                        key={c.id}
                        className={`schedule-card ${typeColors[c.type]}`}
                        onClick={() => open({ type: 'class', id: c.id })}
                      >
                        <div className="schedule-card-time">
                          <span>
                            {c.time} — {endTime(c.time, c.duration)}
                          </span>
                          <span>{c.duration} мин</span>
                        </div>
                        <h3>{c.title}</h3>
                        <p>
                          <Avatar name={instructor.name} size="tiny" color={instructor.color} />
                          {instructor.name}
                        </p>
                        <div className="schedule-card-bottom">
                          <span>
                            <MapPin size={13} />
                            {c.room}
                          </span>
                          <span>
                            <Users size={14} />
                            {count}/{c.capacity}
                          </span>
                        </div>
                        <div className="mini-progress">
                          <i style={{ width: `${(count / c.capacity) * 100}%` }} />
                        </div>
                      </button>
                    );
                  })
              ) : view === 'day' ? (
                <Empty
                  title="День открыт для новых занятий"
                  text="Добавьте занятие или выберите другую дату."
                  action={
                    !trainer && (
                      <button
                        className="button"
                        onClick={() => open({ type: 'class-form', date: d })}
                      >
                        <Plus size={16} />
                        Добавить занятие
                      </button>
                    )
                  }
                />
              ) : (
                <span className="week-empty">Нет занятий</span>
              )}
            </div>
          ))}
        </div>
        <div className="panel-foot">
          <span>
            <span className="status-dot" />
            Занятия по московскому времени
          </span>
          <span>Нажмите на занятие, чтобы открыть список участников</span>
        </div>
      </section>
    </>
  );
}
export function Clients({
  data,
  open,
  initialSearch = '',
}: PageProps & { initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState('all');
  const trainer = data.user.role === 'trainer';
  const active = new Set(
    data.memberships
      .filter((m) => m.remaining > 0 && m.start_date <= data.today && m.end_date >= data.today)
      .map((m) => m.client_id),
  );
  const clients = data.clients.filter(
    (c) =>
      `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || (filter === 'active' ? active.has(c.id) : !active.has(c.id))),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЛЮДИ, РАДИ КОТОРЫХ МЫ ЗДЕСЬ</div>
          <h1>
            Клиенты<span className="heading-dot">.</span>
          </h1>
          <p>
            {trainer
              ? 'Участники ваших занятий и история посещений.'
              : 'Знакомые лица, личные истории и забота о каждом.'}
          </p>
        </div>
        {!trainer && (
          <button className="button primary" onClick={() => open({ type: 'client-form' })}>
            <Plus size={18} />
            Добавить клиента
          </button>
        )}
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="tab-list">
            {[
              ['all', 'Все клиенты', data.clients.length],
              ...(!trainer
                ? [
                    ['active', 'С абонементом', active.size],
                    ['inactive', 'Без абонемента', data.clients.length - active.size],
                  ]
                : []),
            ].map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setFilter(String(key))}
                className={filter === key ? 'active' : ''}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Имя или телефон" />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                {!trainer && <th>Абонемент</th>}
                <th>Посещения</th>
                <th>В студии с</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const membership = data.memberships.find(
                  (m) =>
                    m.client_id === c.id &&
                    m.remaining > 0 &&
                    m.start_date <= data.today &&
                    m.end_date >= data.today,
                );
                const visits = data.bookings.filter(
                  (b) => b.client_id === c.id && b.status === 'attended',
                ).length;
                return (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="person-cell"
                        onClick={() => open({ type: 'client', id: c.id })}
                      >
                        <Avatar
                          name={c.name}
                          color={['purple', 'green', 'peach', 'pink'][c.id % 4]}
                        />
                        <div>
                          <strong>{c.name}</strong>
                          <span>{c.email || c.source}</span>
                        </div>
                      </button>
                    </td>
                    <td className="nowrap">{c.phone}</td>
                    {!trainer && (
                      <td>
                        {membership ? (
                          <div className="membership-cell">
                            <Badge>{membership.name}</Badge>
                            <small>
                              {membership.remaining} из {membership.total} занятий · до{' '}
                              {dateLabel(membership.end_date)}
                            </small>
                          </div>
                        ) : (
                          <Badge color="gray">Нет активного</Badge>
                        )}
                      </td>
                    )}
                    <td>
                      {visits} <span className="muted">занятий</span>
                    </td>
                    <td className="muted nowrap">{dateLabel(c.created_at)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Открыть клиента ${c.name}`}
                        onClick={() => open({ type: 'client', id: c.id })}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!clients.length && (
          <Empty
            title="Клиенты не найдены"
            text={
              search
                ? 'Попробуйте другое имя или номер телефона.'
                : 'Добавьте первого клиента, чтобы начать работу.'
            }
          />
        )}
        <div className="panel-foot">
          <span>Найдено клиентов: {clients.length}</span>
          {!trainer && (
            <button
              className="text-link"
              onClick={() =>
                downloadCsv('clients.csv', [
                  ['Имя', 'Телефон', 'Email', 'Источник', 'Дата добавления'],
                  ...clients.map((c) => [c.name, c.phone, c.email, c.source, c.created_at]),
                ])
              }
            >
              <ArrowDownToLine size={14} />
              Экспорт CSV
            </button>
          )}
        </div>
      </section>
    </>
  );
}
export function Memberships({ data, open }: PageProps) {
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const status = (m: Data['memberships'][number]) =>
    m.end_date < data.today || m.remaining === 0
      ? 'expired'
      : m.start_date > data.today
        ? 'future'
        : 'active';
  const members = data.memberships.filter(
    (m) =>
      (filter === 'all' ||
        status(m) === filter ||
        (filter === 'expiring' &&
          status(m) === 'active' &&
          (m.end_date <= shiftDate(data.today, 7) || m.remaining <= 2))) &&
      `${m.name} ${data.clients.find((c) => c.id === m.client_id)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">РЕГУЛЯРНОСТЬ, КОТОРАЯ ВДОХНОВЛЯЕТ</div>
          <h1>
            Абонементы<span className="heading-dot">.</span>
          </h1>
          <p>Гибкие форматы для каждого ритма жизни.</p>
        </div>
        <button className="button primary" onClick={() => open({ type: 'sale' })}>
          <Plus size={18} />
          Продать абонемент
        </button>
      </div>
      <div className="plans-grid">
        {data.plans.map((p) => (
          <button
            className={`plan-card ${p.color}`}
            key={p.id}
            onClick={() => open({ type: 'sale', planId: p.id })}
          >
            <span className="plan-icon">
              <CreditCard size={20} />
            </span>
            <h3>{p.name}</h3>
            <p>
              {p.visits} {p.visits === 1 ? 'занятие' : p.visits < 5 ? 'занятия' : 'занятий'} ·{' '}
              {p.days} дней
            </p>
            <div>
              <strong>{money(p.price)}</strong>
              <ArrowUpRight size={18} />
            </div>
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="tab-list">
            {[
              ['active', 'Активные'],
              ['expiring', 'Заканчиваются'],
              ['expired', 'Завершённые'],
              ['all', 'Все'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={filter === key ? 'active' : ''}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Клиент или абонемент" />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Абонемент</th>
                <th>Осталось занятий</th>
                <th>Срок действия</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const c = data.clients.find((c) => c.id === m.client_id)!;
                return (
                  <tr key={m.id}>
                    <td>
                      <button
                        className="person-cell"
                        onClick={() => open({ type: 'client', id: c.id })}
                      >
                        <Avatar name={c.name} color={['purple', 'green', 'peach'][c.id % 3]} />
                        <strong>{c.name}</strong>
                      </button>
                    </td>
                    <td>{m.name}</td>
                    <td>
                      <div className="remaining-cell">
                        <strong>
                          {m.remaining}
                          <span> / {m.total}</span>
                        </strong>
                        <div className="mini-progress">
                          <i style={{ width: `${(m.remaining / m.total) * 100}%` }} />
                        </div>
                        <small>В записи: {m.reserved}</small>
                      </div>
                    </td>
                    <td className="nowrap">
                      {dateLabel(m.start_date)} — {dateLabel(m.end_date)}
                    </td>
                    <td>
                      <Badge
                        color={
                          status(m) === 'active'
                            ? 'green'
                            : status(m) === 'future'
                              ? 'blue'
                              : 'gray'
                        }
                      >
                        {status(m) === 'active'
                          ? 'Активен'
                          : status(m) === 'future'
                            ? 'Ожидает начала'
                            : 'Завершён'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!members.length && (
          <Empty
            title="Здесь пока нет абонементов"
            text="Выберите другую вкладку или оформите новый абонемент."
          />
        )}
        <div className="panel-foot">
          <span>Абонементов: {members.length}</span>
          <span>Занятие списывается после отметки посещения</span>
        </div>
      </section>
    </>
  );
}
export function Finance({ data, open }: PageProps) {
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const [method, setMethod] = useState('');
  const payments = data.payments.filter(
    (p) => p.date.startsWith(month) && (!method || p.method === method),
  );
  const sum = payments.reduce((s, p) => s + p.amount, 0);
  const exportData = () =>
    downloadCsv(`payments-${month}.csv`, [
      ['Дата', 'Клиент', 'Описание', 'Сумма, руб', 'Способ оплаты'],
      ...payments.map((p) => [
        dateLabel(p.date, { day: 'numeric', month: 'numeric', year: 'numeric' }),
        data.clients.find((c) => c.id === p.client_id)?.name || '',
        p.description,
        p.amount,
        methods[p.method],
      ]),
    ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ПОНЯТНАЯ КАРТИНА БИЗНЕСА</div>
          <h1>
            Финансы<span className="heading-dot">.</span>
          </h1>
          <p>Все оплаты на виду. Спокойствие в цифрах.</p>
        </div>
        <button className="button" onClick={exportData}>
          <ArrowDownToLine size={17} />
          Выгрузить отчёт
        </button>
      </div>
      <div className="stats-grid finance-stats">
        <Stat
          title="Выручка за период"
          value={money(sum)}
          detail={`${payments.length} оплат`}
          icon={<Wallet size={20} />}
        />
        <Stat
          title="Средний чек"
          value={money(payments.length ? Math.round(sum / payments.length) : 0)}
          detail="На одну продажу абонемента"
          color="green"
          icon={<CreditCard size={20} />}
        />
        <Stat
          title="Клиентов с оплатами"
          value={new Set(payments.map((p) => p.client_id)).size}
          detail="За выбранный период"
          color="peach"
          icon={<Users size={20} />}
        />
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <h2>История оплат</h2>
          <div className="finance-filters">
            <input
              type="month"
              aria-label="Месяц отчёта"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <select
              aria-label="Способ оплаты"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">Все способы</option>
              {Object.entries(methods).map(([key, value]) => (
                <option value={key} key={key}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Назначение</th>
                <th>Способ</th>
                <th>Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const c = data.clients.find((c) => c.id === p.client_id)!;
                return (
                  <tr key={p.id}>
                    <td className="nowrap">{dateLabel(p.date)}</td>
                    <td>
                      <button
                        className="person-cell"
                        onClick={() => open({ type: 'client', id: c.id })}
                      >
                        <Avatar name={c.name} color={['green', 'purple', 'peach'][c.id % 3]} />
                        <strong>{c.name}</strong>
                      </button>
                    </td>
                    <td>{p.description}</td>
                    <td>
                      <span className="payment-method">
                        <CreditCard size={15} />
                        {methods[p.method]}
                      </span>
                    </td>
                    <td className="money-cell">{money(p.amount)}</td>
                    <td>
                      <Badge>Оплачено</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!payments.length && (
          <Empty
            title="Оплат за этот период нет"
            text="Продажи абонементов автоматически появляются здесь."
          />
        )}
        <div className="panel-foot">
          <span>Итого: {money(sum)}</span>
          <span>Журнал полученных оплат · без подключения к банку</span>
        </div>
      </section>
    </>
  );
}
export function Team({ data, open }: PageProps) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">НАША ОБЩАЯ СИЛА</div>
          <h1>
            Команда<span className="heading-dot">.</span>
          </h1>
          <p>Люди, которые помогают двигаться дальше.</p>
        </div>
        {data.user.role === 'owner' && (
          <button className="button primary" onClick={() => open({ type: 'employee' })}>
            <Plus size={18} />
            Добавить сотрудника
          </button>
        )}
      </div>
      <div className="team-grid">
        {data.instructors.map((i) => {
          const classes = data.classes.filter(
            (c) => c.instructor_id === i.id && c.date >= data.today && c.status !== 'cancelled',
          );
          const ids = new Set(classes.map((c) => c.id));
          return (
            <section className="panel team-card" key={i.id}>
              <Avatar name={i.name} color={i.color} size="large" />
              <h2>{i.name}</h2>
              <Badge color={i.color}>Тренер</Badge>
              <p>{i.specialty}</p>
              <div className="team-stats">
                <div>
                  <strong>{classes.length}</strong>
                  <span>предстоящих занятий</span>
                </div>
                <div>
                  <strong>
                    {
                      data.bookings.filter((b) => ids.has(b.class_id) && b.status !== 'cancelled')
                        .length
                    }
                  </strong>
                  <span>записей</span>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      {!data.instructors.length && (
        <section className="panel">
          <Empty
            title="Ваша команда начинается здесь"
            text="Добавьте тренера, чтобы планировать занятия."
          />
        </section>
      )}
      {data.user.role === 'owner' && (
        <section className="panel staff-panel">
          <PanelTitle title="Доступ к CRM" subtitle="Личные учётные записи и права сотрудников" />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>Доступ</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={u.name} />
                        <strong>{u.name}</strong>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <Badge
                        color={
                          u.role === 'owner' ? 'purple' : u.role === 'admin' ? 'blue' : 'green'
                        }
                      >
                        {roleLabel[u.role]}
                      </Badge>
                    </td>
                    <td className="muted">
                      {u.role === 'owner'
                        ? 'Все разделы и настройки'
                        : u.role === 'admin'
                          ? 'Клиенты, расписание, продажи'
                          : 'Свои занятия и посещения'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
export function Settings({
  data,
  save,
}: {
  data: Data;
  save: (path: string, method: string, body: unknown, message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await save('/settings', 'PATCH', body, 'Настройки студии сохранены');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАШЕ ПРОСТРАНСТВО</div>
          <h1>
            Настройки<span className="heading-dot">.</span>
          </h1>
          <p>Важные детали, которые делают студию вашей.</p>
        </div>
      </div>
      <div className="settings-layout">
        <section className="panel settings-form">
          <PanelTitle title="О студии" subtitle="Основная информация и финансовая цель" />
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Название студии">
                <input
                  name="studio_name"
                  defaultValue={data.settings.studio_name}
                  maxLength={60}
                  required
                />
              </Field>
              <Field label="Подпись">
                <input
                  name="subtitle"
                  defaultValue={data.settings.subtitle}
                  maxLength={80}
                  required
                />
              </Field>
              <Field label="Телефон">
                <input
                  name="phone"
                  type="tel"
                  defaultValue={data.settings.phone}
                  maxLength={30}
                  placeholder="+7 (999) 000-00-00"
                />
              </Field>
              <Field label="План выручки на месяц, ₽">
                <input
                  name="monthly_goal"
                  type="number"
                  min="1"
                  max="100000000"
                  defaultValue={data.settings.monthly_goal}
                  required
                />
              </Field>
              <Field label="Адрес" className="full">
                <input
                  name="address"
                  defaultValue={data.settings.address}
                  maxLength={200}
                  placeholder="Город, улица, дом"
                />
              </Field>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-footer">
              <Submit busy={busy}>Сохранить изменения</Submit>
            </div>
          </form>
        </section>
        <aside className="settings-notes">
          <section className="panel">
            <ShieldCheck size={24} />
            <h3>У каждого своя роль</h3>
            <p>
              Владелец управляет настройками и командой. Администратор ведёт клиентов, расписание и
              оплаты. Тренер видит свои занятия и отмечает посещения.
            </p>
          </section>
          <section className="panel">
            <Clock3 size={24} />
            <h3>В одном часовом поясе</h3>
            <p>Расписание и даты студии используют московское время — Europe/Moscow.</p>
          </section>
          {data.demo && (
            <section className="notice peach">
              <strong>Демонстрационная студия</strong>
              <p>
                Здесь используются вымышленные клиенты и открытый демовход. Для работы с настоящими
                клиентами создайте отдельную рабочую студию с личными аккаунтами. Инструкция запуска
                есть в документации.
              </p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
