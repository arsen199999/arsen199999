import { useCallback, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Field, ModalFrame, Submit } from './components';
import { dateLabel, endTime, shiftDate } from './lib';
import { Schedule } from './Pages';
import type { Data, Modal, Mutate, ScheduleView } from './types';
export const scheduleItems: { id: ScheduleView; label: string }[] = [
  { id: 'schedule', label: 'Расписание' },
  { id: 'duties', label: 'График дежурств' },
  { id: 'instructors', label: 'График работы тренеров' },
  { id: 'rooms', label: 'График работы залов' },
  { id: 'bookings', label: 'Записи' },
];
export default function ScheduleViews({
  view,
  data,
  mutate,
  open,
}: {
  view: ScheduleView;
  data: Data;
  mutate: Mutate;
  open: (m: Modal) => void;
}) {
  const [date, setDate] = useState(data.today),
    [until, setUntil] = useState(shiftDate(data.today, 6)),
    [filter, setFilter] = useState(''),
    [modal, setModal] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const close = useCallback(() => setModal(false), []);
  if (view === 'schedule') return <Schedule data={data} open={open} />;
  const classes = data.classes.filter(
    (c) => c.date >= date && c.date <= until && c.status !== 'cancelled',
  );
  const rows =
    view === 'rooms'
      ? [...new Set(data.classes.map((c) => c.room))].sort()
      : data.instructors.map((i) => i.name);
  const bookings = data.bookings.filter(
    (b) => classes.some((c) => c.id === b.class_id) && (!filter || b.status === filter),
  );
  async function remove(id: number) {
    setBusy(true);
    setError('');
    try {
      await mutate(`/duties/${id}`, 'DELETE', {}, 'Дежурство удалено');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reports-page">
      <div className="report-title">
        <div>
          <h1>{scheduleItems.find((i) => i.id === view)?.label}</h1>
          <p>
            {view === 'instructors' || view === 'rooms'
              ? 'Занятость по занятиям в расписании'
              : 'Работа студии за выбранный период'}
          </p>
        </div>
        {view === 'duties' && (
          <button className="button primary" onClick={() => setModal(true)}>
            <Plus size={16} />
            Добавить дежурство
          </button>
        )}
      </div>
      <div className="report-filters">
        <Field label="С даты">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="По дату">
          <input type="date" min={date} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        {view === 'bookings' && (
          <Field label="Статус записи">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="booked">Записан</option>
              <option value="attended">Посетил</option>
              <option value="cancelled">Отменена</option>
            </select>
          </Field>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {view === 'duties' ? (
        <section className="report-panel report-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сотрудник</th>
                <th>Начало</th>
                <th>Окончание</th>
                <th>Заметка</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.duties
                .filter((d) => d.date >= date && d.date <= until)
                .map((d) => (
                  <tr key={d.id}>
                    <td>{dateLabel(d.date)}</td>
                    <td>{data.staff.find((u) => u.id === d.manager_id)?.name}</td>
                    <td>{d.start_time}</td>
                    <td>{d.end_time}</td>
                    <td>{d.notes}</td>
                    <td>
                      <button
                        className="button small"
                        disabled={busy}
                        onClick={() => void remove(d.id)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!data.duties.some((d) => d.date >= date && d.date <= until) && (
            <p className="chart-empty">Дежурства не назначены</p>
          )}
        </section>
      ) : view === 'bookings' ? (
        <section className="report-panel report-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время</th>
                <th>Клиент</th>
                <th>Занятие</th>
                <th>Тренер</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const c = classes.find((c) => c.id === b.class_id)!;
                return (
                  <tr key={b.id}>
                    <td>{dateLabel(c.date)}</td>
                    <td>{c.time}</td>
                    <td>
                      <button
                        className="table-link"
                        onClick={() => open({ type: 'client', id: b.client_id })}
                      >
                        {data.clients.find((c) => c.id === b.client_id)?.name}
                      </button>
                    </td>
                    <td>
                      <button
                        className="table-link"
                        onClick={() => open({ type: 'class', id: c.id })}
                      >
                        {c.title}
                      </button>
                    </td>
                    <td>{data.instructors.find((i) => i.id === c.instructor_id)?.name}</td>
                    <td>
                      {{ booked: 'Записан', attended: 'Посетил', cancelled: 'Отменена' }[b.status]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!bookings.length && <p className="chart-empty">Записей за период нет</p>}
        </section>
      ) : (
        <div className="report-grid">
          {rows.map((name) => {
            const lessons = classes.filter((c) =>
              view === 'rooms'
                ? c.room === name
                : data.instructors.find((i) => i.id === c.instructor_id)?.name === name,
            );
            return (
              <section className="report-panel" key={name}>
                <h2>
                  {name} · {lessons.length} занятий
                </h2>
                {lessons.map((c) => (
                  <button
                    className="work-slot"
                    key={c.id}
                    onClick={() => open({ type: 'class', id: c.id })}
                  >
                    <time>
                      {dateLabel(c.date)} · {c.time}–{endTime(c.time, c.duration)}
                    </time>
                    <strong>{c.title}</strong>
                    <span>
                      {view === 'rooms'
                        ? data.instructors.find((i) => i.id === c.instructor_id)?.name
                        : c.room}
                    </span>
                  </button>
                ))}
                {!lessons.length && <p className="chart-empty">Занятий в периоде нет</p>}
              </section>
            );
          })}
        </div>
      )}
      {modal && <DutyForm data={data} close={close} mutate={mutate} />}
    </div>
  );
}
function DutyForm({ data, close, mutate }: { data: Data; close: () => void; mutate: Mutate }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mutate(
        '/duties',
        'POST',
        Object.fromEntries(new FormData(e.currentTarget)),
        'Дежурство добавлено',
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame title="Новое дежурство" onClose={close}>
      <form onSubmit={submit}>
        <Field label="Сотрудник">
          <select name="manager_id" required>
            {data.staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Дата">
          <input name="date" type="date" defaultValue={data.today} required />
        </Field>
        <div className="form-grid">
          <Field label="Начало">
            <input name="start_time" type="time" defaultValue="09:00" required />
          </Field>
          <Field label="Окончание">
            <input name="end_time" type="time" defaultValue="18:00" required />
          </Field>
        </div>
        <Field label="Заметка">
          <textarea name="notes" maxLength={2000} />
        </Field>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Submit busy={busy} />
        </div>
      </form>
    </ModalFrame>
  );
}
