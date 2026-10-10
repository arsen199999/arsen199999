import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  CreditCard,
  Flower2,
  Plus,
  Users,
  Wallet,
} from 'lucide-react';
import { Avatar, Badge, Empty, PanelTitle, Stat, TextLink } from './components';
import { dateLabel, money, shiftDate, typeColors } from './lib';
import type { Data, Modal, Page, StudioClass } from './types';

type Props = { data: Data; navigate: (page: Page) => void; open: (modal: Modal) => void };
export function ClassRow({
  klass,
  data,
  open,
}: {
  klass: StudioClass;
  data: Data;
  open: () => void;
}) {
  const instructor = data.instructors.find((i) => i.id === klass.instructor_id)!;
  const count = data.bookings.filter(
    (b) => b.class_id === klass.id && b.status !== 'cancelled',
  ).length;
  return (
    <button className="class-row" onClick={open}>
      <div className="class-time">
        <strong>{klass.time}</strong>
        <span>{klass.duration} мин</span>
      </div>
      <div className={`class-line ${typeColors[klass.type]}`} />
      <div className="class-description">
        <strong>{klass.title}</strong>
        <span>
          <Avatar name={instructor.name} color={instructor.color} size="tiny" />
          {instructor.name}
        </span>
      </div>
      <div className="class-places">
        <span>
          <Users size={14} />
          <strong>{count}</strong> / {klass.capacity}
        </span>
        <div className="mini-progress">
          <i style={{ width: `${(count / klass.capacity) * 100}%` }} />
        </div>
      </div>
      <ChevronRight size={17} className="row-chevron" />
    </button>
  );
}
export function RevenueChart({ data }: { data: Data }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(data.today, i - 6));
  const values = days.map((d) =>
    data.payments.filter((p) => p.date.slice(0, 10) === d).reduce((s, p) => s + p.amount, 0),
  );
  const max = Math.max(...values, 1000);
  const points = values.map((v, i) => `${32 + i * 69},${130 - (v / max) * 105}`);
  return (
    <div className="revenue-chart">
      <div className="chart-y">
        <span>{money(max)}</span>
        <span>{money(Math.round(max / 2))}</span>
        <span>0</span>
      </div>
      <div className="chart-main">
        <svg
          viewBox="0 0 470 152"
          role="img"
          aria-label={`Выручка за 7 дней: ${values.map((v, i) => `${dateLabel(days[i])} — ${money(v)}`).join(', ')}`}
        >
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8d7acb" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8d7acb" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 77, 130].map((y) => (
            <line key={y} x1="20" y1={y} x2="455" y2={y} stroke="#edebf1" strokeDasharray="4 5" />
          ))}
          <polygon points={`32,142 ${points.join(' ')} 446,142`} fill="url(#chart-fill)" />
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="#8e79c6"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {values.map((v, i) => (
            <circle
              key={i}
              cx={32 + i * 69}
              cy={130 - (v / max) * 105}
              r="4"
              fill="#fff"
              stroke="#8e79c6"
              strokeWidth="2"
            >
              <title>
                {dateLabel(days[i])}: {money(v)}
              </title>
            </circle>
          ))}
        </svg>
        <div className="chart-labels">
          {days.map((d) => (
            <span key={d}>{dateLabel(d, { day: 'numeric', month: 'numeric' })}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
export default function Dashboard({ data, navigate, open }: Props) {
  const trainer = data.user.role === 'trainer';
  const classes = data.classes.filter((c) => c.date === data.today && c.status !== 'cancelled');
  const ids = new Set(classes.map((c) => c.id));
  const todayBookings = data.bookings.filter(
    (b) => ids.has(b.class_id) && b.status !== 'cancelled',
  );
  const month = data.today.slice(0, 7);
  const revenue = data.payments
    .filter((p) => p.date.startsWith(month))
    .reduce((s, p) => s + p.amount, 0);
  const active = data.memberships.filter(
    (m) => m.start_date <= data.today && m.end_date >= data.today && m.remaining > 0,
  );
  const expiring = active
    .filter((m) => m.end_date <= shiftDate(data.today, 7) || m.remaining <= 2)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
  const capacity = classes.reduce((s, c) => s + c.capacity, 0);
  const occupancy = capacity ? Math.round((todayBookings.length / capacity) * 100) : 0;
  const uniqueClients = new Set(todayBookings.map((b) => b.client_id)).size;
  const attended = todayBookings.filter((b) => b.status === 'attended').length;
  const goal = Number(data.settings.monthly_goal) || 150000;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАША СТУДИЯ, ОДНИМ ВЗГЛЯДОМ</div>
          <h1>
            {trainer ? 'Мой день' : 'Обзор студии'}
            <span className="heading-dot">.</span>
          </h1>
          <p>Здравствуйте, {data.user.name.split(' ')[0]}. Пусть сегодня всё сложится.</p>
        </div>
        {!trainer && (
          <button
            className="button primary"
            onClick={() =>
              classes[0] ? open({ type: 'class', id: classes[0].id }) : navigate('schedule')
            }
          >
            <Plus size={18} />
            Записать клиента
          </button>
        )}
      </div>
      <div className="stats-grid">
        {!trainer ? (
          <>
            <Stat
              title="Выручка за месяц"
              value={money(revenue)}
              detail={dateLabel(data.today, { month: 'long', year: 'numeric' }).replace(' г.', '')}
              icon={<Wallet size={20} />}
              onClick={() => navigate('finance')}
            />
            <Stat
              title="Активные клиенты"
              value={new Set(active.map((m) => m.client_id)).size}
              detail={`${data.clients.length} клиентов в базе`}
              icon={<Users size={20} />}
              color="green"
              onClick={() => navigate('clients')}
            />
            <Stat
              title="Занятия сегодня"
              value={classes.length}
              detail={`${todayBookings.length} записей на занятия`}
              icon={<CalendarDays size={20} />}
              color="peach"
              onClick={() => navigate('schedule')}
            />
            <Stat
              title="Активные абонементы"
              value={active.length}
              detail={`${expiring.length} требуют внимания`}
              icon={<CreditCard size={20} />}
              color="pink"
              onClick={() => navigate('memberships')}
            />
          </>
        ) : (
          <>
            <Stat
              title="Мои занятия сегодня"
              value={classes.length}
              detail="Ваше личное расписание"
              icon={<CalendarDays size={20} />}
              onClick={() => navigate('schedule')}
            />
            <Stat
              title="Клиенты сегодня"
              value={uniqueClients}
              detail={`${todayBookings.length} записей на занятия`}
              icon={<Users size={20} />}
              color="green"
              onClick={() => navigate('clients')}
            />
            <Stat
              title="Посещений отмечено"
              value={attended}
              detail={`${todayBookings.length - attended} ожидают отметки`}
              icon={<Clock3 size={20} />}
              color="peach"
              onClick={() => navigate('schedule')}
            />
            <Stat
              title="Заполненность"
              value={`${occupancy}%`}
              detail={`${todayBookings.length} из ${capacity} мест`}
              icon={<Flower2 size={20} />}
              color="pink"
              onClick={() => navigate('schedule')}
            />
          </>
        )}
      </div>
      <div className="dashboard-main">
        <section className="panel today-panel">
          <PanelTitle
            title={trainer ? 'Мои занятия сегодня' : 'Занятия сегодня'}
            subtitle={dateLabel(data.today, { weekday: 'long', day: 'numeric', month: 'long' })}
            action={<TextLink onClick={() => navigate('schedule')}>Всё расписание</TextLink>}
          />
          <div className="class-list">
            {classes.length ? (
              classes.map((c) => (
                <ClassRow
                  key={c.id}
                  klass={c}
                  data={data}
                  open={() => open({ type: 'class', id: c.id })}
                />
              ))
            ) : (
              <Empty
                title="Сегодня свободный день"
                text="Новые занятия появятся здесь после добавления в расписание."
                action={
                  !trainer && (
                    <button
                      className="button"
                      onClick={() => open({ type: 'class-form', date: data.today })}
                    >
                      Добавить занятие
                    </button>
                  )
                }
              />
            )}
          </div>
          <div className="panel-foot">
            <span className="status-dot" />
            {uniqueClients
              ? `${uniqueClients} клиентов планируют посетить студию`
              : 'Время для новых планов'}
            <span>Время московское</span>
          </div>
        </section>
        <div className="dashboard-side">
          <section className="panel occupancy-panel">
            <PanelTitle
              title="Наполняемость групп"
              action={<span className="muted small">Сегодня</span>}
            />
            <div className="donut-wrap">
              <svg viewBox="0 0 160 160" aria-label={`Заполненность ${occupancy}%`} role="img">
                <circle cx="80" cy="80" r="65" fill="none" stroke="#f0edf6" strokeWidth="12" />
                <circle
                  cx="80"
                  cy="80"
                  r="65"
                  fill="none"
                  stroke="#9b86cb"
                  strokeWidth="12"
                  strokeDasharray={`${occupancy * 4.084} 408.4`}
                  strokeLinecap="round"
                  transform="rotate(-90 80 80)"
                />
              </svg>
              <div>
                <strong>
                  {occupancy}
                  <span>%</span>
                </strong>
                <small>мест занято</small>
              </div>
            </div>
            <div className="occupancy-legend">
              <span>
                <i />
                Записано <b>{todayBookings.length}</b>
              </span>
              <span>
                <i />
                Свободно <b>{capacity - todayBookings.length}</b>
              </span>
            </div>
          </section>
          <section className="kind-card">
            <div>
              <span className="eyebrow">МЕСТО, ГДЕ ЗАБОТЯТСЯ</span>
              <h3>
                Маленькие шаги.
                <br />
                Большие изменения.
              </h3>
              <p>
                За каждой записью — человек,
                <br />
                который выбирает себя.
              </p>
            </div>
            <Flower2 className="kind-flower" strokeWidth={0.7} />
          </section>
        </div>
      </div>
      {!trainer && (
        <div className="dashboard-bottom">
          <section className="panel">
            <PanelTitle
              title="Финансовый ритм"
              subtitle="Выручка за последние 7 дней"
              action={
                <button
                  className="icon-button"
                  aria-label="Перейти к финансам"
                  onClick={() => navigate('finance')}
                >
                  <ArrowUpRight size={20} />
                </button>
              }
            />
            <div className="revenue-total">
              <strong>
                {money(
                  data.payments
                    .filter((p) => p.date.slice(0, 10) >= shiftDate(data.today, -6))
                    .reduce((s, p) => s + p.amount, 0),
                )}
              </strong>
              <span>
                <span className="legend-dot" />
                Оплаты клиентов
              </span>
            </div>
            <RevenueChart data={data} />
            <div className="goal-line">
              <span>
                План месяца <b>{Math.round((revenue / goal) * 100)}%</b>
              </span>
              <span>
                {money(revenue)} / {money(goal)}
              </span>
            </div>
            <div className="goal-progress">
              <i style={{ width: `${Math.min(100, (revenue / goal) * 100)}%` }} />
            </div>
          </section>
          <section className="panel attention-panel">
            <PanelTitle
              title="Чуть больше внимания"
              subtitle="Самое время предложить продление"
              action={<span className="count-badge">{expiring.length}</span>}
            />
            {expiring.length ? (
              expiring.slice(0, 4).map((m) => {
                const c = data.clients.find((c) => c.id === m.client_id)!;
                return (
                  <button
                    key={m.id}
                    className="attention-row"
                    onClick={() => open({ type: 'client', id: c.id })}
                  >
                    <Avatar name={c.name} color={['purple', 'peach', 'green'][c.id % 3]} />
                    <div>
                      <strong>{c.name}</strong>
                      <span>
                        {m.remaining <= 2
                          ? `Осталось занятий: ${m.remaining}`
                          : `До ${dateLabel(m.end_date)}`}
                      </span>
                    </div>
                    <Badge color="peach">Продление</Badge>
                    <ArrowUpRight size={16} />
                  </button>
                );
              })
            ) : (
              <Empty
                title="Всё в порядке"
                text="Здесь появятся абонементы, которые скоро закончатся."
              />
            )}
            <button className="attention-footer" onClick={() => navigate('memberships')}>
              Посмотреть все абонементы
              <ArrowDownRight size={16} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}
