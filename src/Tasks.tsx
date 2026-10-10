import { useCallback, useState, type FormEvent } from 'react';
import { Plus, Phone, CalendarDays, ListChecks } from 'lucide-react';
import { Field, ModalFrame, Submit } from './components';
import { dateLabel, shiftDate } from './lib';
import type { Data, Modal, Mutate, Task } from './types';
const names: Record<string, string> = { call: 'Звонок', meeting: 'Встреча', task: 'Задание' };
export default function Tasks({
  data,
  mutate,
  open,
}: {
  data: Data;
  mutate: Mutate;
  open: (m: Modal) => void;
}) {
  const [modal, setModal] = useState<Task | 'new' | null>(null),
    [query, setQuery] = useState(''),
    [manager, setManager] = useState(''),
    [type, setType] = useState(''),
    [done, setDone] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleteId, setDeleteId] = useState<number | null>(null);
  const close = useCallback(() => setModal(null), []);
  const tomorrow = shiftDate(data.today, 1),
    after = shiftDate(data.today, 2);
  const tasks = data.tasks.filter(
    (t) =>
      t.status === (done ? 'done' : 'open') &&
      (!manager || String(t.manager_id) === manager) &&
      (!type || t.type === type) &&
      `${t.title} ${t.notes} ${data.clients.find((c) => c.id === t.client_id)?.name || ''} ${data.leads.find((l) => l.id === t.lead_id)?.name || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const columns = done
    ? [{ name: 'Выполненные задачи', items: tasks }]
    : [
        { name: 'Просроченные задачи', items: tasks.filter((t) => t.due_date < data.today) },
        { name: 'Сегодня', items: tasks.filter((t) => t.due_date === data.today) },
        { name: 'Завтра', items: tasks.filter((t) => t.due_date === tomorrow) },
        { name: 'Позже', items: tasks.filter((t) => t.due_date >= after) },
      ];
  async function status(id: number, status: string) {
    setBusy(true);
    setError('');
    try {
      await mutate(
        `/tasks/${id}`,
        'PATCH',
        { status },
        status === 'done'
          ? 'Задача выполнена'
          : status === 'deleted'
            ? 'Задача удалена'
            : 'Задача возвращена в работу',
      );
      setDeleteId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tasks-page">
      <div className="report-title">
        <div>
          <h1>Задачи</h1>
          <p>Звонки, встречи и дела студии</p>
        </div>
        <button className="button primary" onClick={() => setModal('new')}>
          <Plus size={16} />
          Создать задачу
        </button>
      </div>
      <div className="lead-filters">
        <Field label="Поиск задачи">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Задача или клиент"
          />
        </Field>
        <Field label="Ответственный">
          <select value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">Все</option>
            {data.staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Тип задачи">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Все</option>
            {Object.entries(names).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <label className="check-filter">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
          Выполненные
        </label>
        <button
          className="button"
          onClick={() => {
            setQuery('');
            setManager('');
            setType('');
            setDone(false);
          }}
        >
          Сбросить фильтры
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="task-board">
        {columns.map((col) => (
          <section key={col.name} className="task-column">
            <h2>
              {col.name}
              <span>{col.items.length}</span>
            </h2>
            {col.name === 'Сегодня' && (
              <p>
                Уже выполнено:{' '}
                {
                  data.tasks.filter(
                    (t) =>
                      t.status === 'done' &&
                      t.completed_at &&
                      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(
                        new Date(t.completed_at),
                      ) === data.today,
                  ).length
                }
              </p>
            )}
            {col.items.map((t) => {
              const late =
                t.status === 'open' &&
                new Date(`${t.due_date}T${t.due_time}:00+03:00`).getTime() < Date.now();
              return (
                <article key={t.id} className={`task-card ${late ? 'overdue' : ''}`}>
                  <div className="task-kind">
                    {t.type === 'call' ? (
                      <Phone size={14} />
                    ) : t.type === 'meeting' ? (
                      <CalendarDays size={14} />
                    ) : (
                      <ListChecks size={14} />
                    )}{' '}
                    {names[t.type]}
                  </div>
                  <time>
                    {dateLabel(t.due_date)} {t.due_time}
                  </time>
                  {t.client_id && (
                    <button
                      className="table-link"
                      onClick={() => open({ type: 'client', id: t.client_id! })}
                    >
                      {data.clients.find((c) => c.id === t.client_id)?.name}
                    </button>
                  )}
                  {t.lead_id && (
                    <small>Заявка: {data.leads.find((l) => l.id === t.lead_id)?.name}</small>
                  )}
                  <h3>{t.title}</h3>
                  {t.notes && <p>{t.notes}</p>}
                  <small>
                    {data.staff.find((u) => u.id === t.manager_id)?.name || 'Без ответственного'}
                  </small>
                  <div className="task-actions">
                    <button
                      className="button report-apply small"
                      disabled={busy}
                      onClick={() => void status(t.id, done ? 'open' : 'done')}
                    >
                      {done ? 'Вернуть в работу' : 'Выполнить'}
                    </button>
                    <button className="button small" onClick={() => setModal(t)}>
                      Перенести / изменить
                    </button>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => setDeleteId(t.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              );
            })}
            {!col.items.length && <div className="kanban-empty">Задач нет</div>}
          </section>
        ))}
      </div>
      {modal && (
        <TaskForm
          task={typeof modal === 'object' ? modal : undefined}
          data={data}
          mutate={mutate}
          close={close}
        />
      )}{' '}
      {deleteId !== null && (
        <ModalFrame title="Удалить задачу?" onClose={() => setDeleteId(null)}>
          <p>Задача будет убрана из списка.</p>
          <div className="form-footer">
            <button className="button" onClick={() => setDeleteId(null)}>
              Отмена
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void status(deleteId, 'deleted')}
            >
              Удалить задачу
            </button>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}
function TaskForm({
  task,
  data,
  mutate,
  close,
}: {
  task?: Task;
  data: Data;
  mutate: Mutate;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mutate(
        task ? `/tasks/${task.id}` : '/tasks',
        task ? 'PATCH' : 'POST',
        Object.fromEntries(new FormData(e.currentTarget)),
        'Задача сохранена',
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame title={task ? 'Изменить задачу' : 'Новая задача'} onClose={close}>
      <form onSubmit={submit}>
        <Field label="Название задачи">
          <input name="title" defaultValue={task?.title} maxLength={150} required />
        </Field>
        <div className="form-grid">
          <Field label="Тип">
            <select name="type" defaultValue={task?.type || 'call'}>
              {Object.entries(names).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ответственный">
            <select name="manager_id" defaultValue={task?.manager_id || data.user.id}>
              <option value="">Не назначен</option>
              {data.staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата задачи">
            <input
              name="due_date"
              type="date"
              defaultValue={task?.due_date || data.today}
              required
            />
          </Field>
          <Field label="Время задачи">
            <input name="due_time" type="time" defaultValue={task?.due_time || '12:00'} required />
          </Field>
          <Field label="Клиент">
            <select name="client_id" defaultValue={task?.client_id || ''}>
              <option value="">Без клиента</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Заявка">
            <select name="lead_id" defaultValue={task?.lead_id || ''}>
              <option value="">Без заявки</option>
              {data.leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.source}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Описание" className="full">
            <textarea name="notes" rows={3} maxLength={2000} defaultValue={task?.notes} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-footer">
          <button type="button" className="button" onClick={close}>
            Отмена
          </button>
          <Submit busy={busy} />
        </div>
      </form>
    </ModalFrame>
  );
}
