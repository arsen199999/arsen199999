import { useCallback, useState, type FormEvent } from 'react';
import { Plus, Settings2, Download, Columns3, List, ArrowUp, ArrowDown, X } from 'lucide-react';
import { Field, ModalFrame, Submit } from './components';
import { dateLabel, money, downloadCsv } from './lib';
import type { Data, Funnel, Lead, Modal, Mutate, Stage } from './types';
export default function Leads({
  data,
  mutate,
  open,
}: {
  data: Data;
  mutate: Mutate;
  open: (m: Modal) => void;
}) {
  const [funnel, setFunnel] = useState(data.funnels[0]?.id),
    [view, setView] = useState('board'),
    [query, setQuery] = useState(''),
    [stageFilter, setStageFilter] = useState(''),
    [source, setSource] = useState(''),
    [manager, setManager] = useState(''),
    [tag, setTag] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [archived, setArchived] = useState(false),
    [withoutTasks, setWithoutTasks] = useState(false);
  const [modal, setModal] = useState<Lead | 'lead' | Funnel | 'funnel' | null>(null),
    [error, setError] = useState(''),
    [moving, setMoving] = useState(false);
  const close = useCallback(() => setModal(null), []);
  const stages = data.stages.filter((s) => s.funnel_id === funnel);
  const leads = data.leads.filter(
    (l) =>
      stages.some((s) => s.id === l.stage_id) &&
      Boolean(l.archived_at) === archived &&
      (!stageFilter || l.stage_id === Number(stageFilter)) &&
      (!source || l.source === source) &&
      (!manager || String(l.manager_id) === manager) &&
      (!tag || l.tags.toLowerCase().includes(tag.toLowerCase())) &&
      (!from || l.date >= from) &&
      (!to || l.date <= to) &&
      (!withoutTasks || !data.tasks.some((t) => t.lead_id === l.id && t.status === 'open')) &&
      `${l.name} ${l.phone} ${l.notes}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function move(id: number, stage_id: number) {
    if (moving) return;
    setMoving(true);
    setError('');
    try {
      await mutate(`/leads/${id}`, 'PATCH', { stage_id }, 'Этап заявки изменён');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMoving(false);
    }
  }
  function card(l: Lead) {
    return (
      <article
        key={l.id}
        className="lead-card"
        draggable={!moving}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', String(l.id));
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <button className="lead-card-open" onClick={() => setModal(l)}>
          <div>
            <b>{l.source}</b>
            <time>{dateLabel(l.date)}</time>
          </div>
          <strong>{l.name}</strong>
          <span>{l.phone}</span>
          {l.amount > 0 && <span>{money(l.amount)}</span>}
          <small>{data.staff.find((u) => u.id === l.manager_id)?.name || 'Без менеджера'}</small>
          {l.tags && <em>{l.tags}</em>}
          {l.client_id && <small className="linked-client">Связана с клиентом</small>}
        </button>
        <select
          aria-label={`Этап заявки ${l.name}`}
          value={l.stage_id}
          disabled={moving}
          onChange={(e) => void move(l.id, Number(e.target.value))}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </article>
    );
  }
  return (
    <div className="leads-page">
      <div className="report-title">
        <div>
          <h1>Заявки</h1>
          <p>От первого обращения до постоянного клиента</p>
        </div>
        <div className="report-actions">
          <button className="button" onClick={() => setModal('funnel')}>
            <Plus size={16} />
            Создать воронку
          </button>
          <button className="button primary" onClick={() => setModal('lead')}>
            <Plus size={16} />
            Создать заявку
          </button>
        </div>
      </div>
      <div className="leads-toolbar">
        <select
          aria-label="Воронка"
          value={funnel}
          onChange={(e) => {
            setFunnel(Number(e.target.value));
            setStageFilter('');
          }}
        >
          {data.funnels.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          className="button"
          onClick={() => setModal(data.funnels.find((f) => f.id === funnel)!)}
        >
          <Settings2 size={15} />
          Настройки воронки
        </button>
        <span className="toolbar-spacer" />
        <button
          className="button"
          onClick={() =>
            downloadCsv('заявки.csv', [
              ['Имя', 'Телефон', 'Этап', 'Источник', 'Менеджер', 'Сумма', 'Теги', 'Дата'],
              ...leads.map((l) => [
                l.name,
                l.phone,
                data.stages.find((s) => s.id === l.stage_id)?.name || '',
                l.source,
                data.staff.find((s) => s.id === l.manager_id)?.name || '',
                l.amount,
                l.tags,
                l.date,
              ]),
            ])
          }
        >
          <Download size={15} />
          Выгрузить CSV
        </button>
        <button
          className={`button ${view === 'board' ? 'selected' : ''}`}
          aria-pressed={view === 'board'}
          onClick={() => setView('board')}
        >
          <Columns3 size={15} />
          Колонки
        </button>
        <button
          className={`button ${view === 'list' ? 'selected' : ''}`}
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          <List size={15} />
          Список
        </button>
      </div>
      <div className="lead-filters">
        <Field label="Заявка">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя, телефон, заметка"
          />
        </Field>
        <Field label="Этап воронки">
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">Все</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Источник">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Все</option>
            {[...new Set(data.leads.map((l) => l.source))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Менеджер">
          <select value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">Все</option>
            {data.staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Теги">
          <input value={tag} onChange={(e) => setTag(e.target.value)} />
        </Field>
        <Field label="Создана с">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Создана по">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Архивные
        </label>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={withoutTasks}
            onChange={(e) => setWithoutTasks(e.target.checked)}
          />
          Без открытых задач
        </label>
        <button
          className="button"
          onClick={() => {
            setQuery('');
            setStageFilter('');
            setSource('');
            setManager('');
            setTag('');
            setFrom('');
            setTo('');
            setArchived(false);
            setWithoutTasks(false);
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
      <p className="report-note">
        {leads.length} заявок · {money(leads.reduce((n, l) => n + l.amount, 0))}. Перетащите
        карточку в нужный этап или выберите этап под ней.
      </p>
      {view === 'board' ? (
        <div className="kanban-board" aria-label="Воронка заявок">
          {stages.map((s) => {
            const items = leads.filter((l) => l.stage_id === s.id);
            return (
              <section
                key={s.id}
                className="kanban-column"
                aria-label={s.name}
                style={{ borderTopColor: s.color }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = Number(e.dataTransfer.getData('text/plain'));
                  if (leads.some((l) => l.id === id)) void move(id, s.id);
                }}
              >
                <h2>{s.name}</h2>
                <p>
                  {items.length} заявок · {money(items.reduce((n, l) => n + l.amount, 0))}
                </p>
                {items.map(card)}
                {!items.length && <div className="kanban-empty">Заявок пока нет</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="report-panel report-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Заявка</th>
                <th>Телефон</th>
                <th>Этап</th>
                <th>Источник</th>
                <th>Менеджер</th>
                <th>Сумма</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <button className="table-link" onClick={() => setModal(l)}>
                      {l.name}
                    </button>
                  </td>
                  <td>{l.phone}</td>
                  <td>{data.stages.find((s) => s.id === l.stage_id)?.name}</td>
                  <td>{l.source}</td>
                  <td>{data.staff.find((u) => u.id === l.manager_id)?.name || '—'}</td>
                  <td>{money(l.amount)}</td>
                  <td>{dateLabel(l.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leads.length && <p className="chart-empty">Заявок по этим фильтрам нет</p>}
        </div>
      )}
      {modal && (modal === 'funnel' || (typeof modal === 'object' && !('phone' in modal))) ? (
        <FunnelForm
          funnel={typeof modal === 'object' ? modal : undefined}
          data={data}
          mutate={mutate}
          close={close}
          onSaved={setFunnel}
        />
      ) : (
        modal && (
          <LeadForm
            lead={typeof modal === 'object' ? modal : undefined}
            stageId={stages[0]?.id}
            data={data}
            mutate={mutate}
            close={close}
            open={open}
          />
        )
      )}
    </div>
  );
}
function LeadForm({
  lead,
  stageId,
  data,
  mutate,
  close,
  open,
}: {
  lead?: Lead;
  stageId?: number;
  data: Data;
  mutate: Mutate;
  close: () => void;
  open: (m: Modal) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function act(path: string, method: string, body: unknown, convert = false) {
    setBusy(true);
    setError('');
    try {
      const result = await mutate(path, method, body, 'Заявка сохранена');
      close();
      if (convert) open({ type: 'client', id: result.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void act(
      lead ? `/leads/${lead.id}` : '/leads',
      lead ? 'PATCH' : 'POST',
      Object.fromEntries(new FormData(e.currentTarget)),
    );
  }
  return (
    <ModalFrame title={lead ? 'Карточка заявки' : 'Новая заявка'} onClose={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Имя">
            <input name="name" defaultValue={lead?.name} required maxLength={150} />
          </Field>
          <Field label="Телефон">
            <input
              type="tel"
              name="phone"
              defaultValue={lead?.phone}
              readOnly={Boolean(lead?.client_id)}
              required
              maxLength={30}
            />
          </Field>
          <Field label="Источник">
            <input
              name="source"
              defaultValue={lead?.source || 'Студия'}
              readOnly={Boolean(lead?.client_id)}
              required
              maxLength={60}
            />
          </Field>
          <Field label="Дата создания">
            <input
              name="date"
              type="date"
              defaultValue={lead?.date || data.today}
              max={data.today}
              readOnly={Boolean(lead?.client_id)}
              required
            />
          </Field>
          <Field label="Этап">
            <select name="stage_id" defaultValue={lead?.stage_id || stageId}>
              {data.funnels.map((f) => (
                <optgroup key={f.id} label={f.name}>
                  {data.stages
                    .filter((s) => s.funnel_id === f.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Ответственный">
            <select name="manager_id" defaultValue={lead?.manager_id || data.user.id}>
              <option value="">Без менеджера</option>
              {data.staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Сумма сделки, ₽">
            <input
              name="amount"
              type="number"
              min="0"
              max="1000000"
              defaultValue={lead?.amount || 0}
              required
            />
          </Field>
          <Field label="Теги через запятую">
            <input name="tags" defaultValue={lead?.tags} maxLength={200} />
          </Field>
          <Field label="Заметка" className="full">
            <textarea name="notes" defaultValue={lead?.notes} maxLength={2000} rows={3} />
          </Field>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          {lead && (
            <>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  void act(`/leads/${lead.id}`, 'PATCH', { archived: !lead.archived_at })
                }
              >
                {lead.archived_at ? 'Вернуть из архива' : 'В архив'}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  lead.client_id
                    ? (close(), open({ type: 'client', id: lead.client_id }))
                    : void act(`/leads/${lead.id}/convert`, 'POST', {}, true)
                }
              >
                {lead.client_id ? 'Открыть клиента' : 'Создать / связать клиента'}
              </button>
            </>
          )}
          <Submit busy={busy} />
        </div>
      </form>
    </ModalFrame>
  );
}
function FunnelForm({
  funnel,
  data,
  mutate,
  close,
  onSaved,
}: {
  funnel?: Funnel;
  data: Data;
  mutate: Mutate;
  close: () => void;
  onSaved: (id: number) => void;
}) {
  const [name, setName] = useState(funnel?.name || ''),
    [stages, setStages] = useState<Partial<Stage>[]>(
      funnel
        ? data.stages.filter((s) => s.funnel_id === funnel.id)
        : [
            { name: 'Новая заявка', color: '#3498db' },
            { name: 'В работе', color: '#e6b23b' },
            { name: 'Успешно', color: '#17ad86' },
          ],
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  function move(i: number, d: number) {
    setStages((rows) => {
      const next = [...rows];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await mutate(
        funnel ? `/funnels/${funnel.id}` : '/funnels',
        funnel ? 'PATCH' : 'POST',
        { name, stages },
        'Воронка сохранена',
      );
      onSaved(r.id!);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame title={funnel ? 'Настройки воронки' : 'Новая воронка'} onClose={close}>
      <form onSubmit={submit}>
        <Field label="Название воронки">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </Field>
        <p className="form-hint">
          Назовите этапы и расположите их в нужном порядке. Этап с заявками можно удалить после
          переноса заявок.
        </p>
        <div className="stage-editor">
          {stages.map((s, i) => (
            <div key={s.id || `new-${i}`}>
              <input
                aria-label={`Цвет этапа ${i + 1}`}
                type="color"
                value={s.color}
                onChange={(e) =>
                  setStages((rows) =>
                    rows.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)),
                  )
                }
              />
              <input
                aria-label={`Название этапа ${i + 1}`}
                value={s.name}
                required
                maxLength={60}
                onChange={(e) =>
                  setStages((rows) =>
                    rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <button
                className="icon-button"
                type="button"
                aria-label={`Поднять этап ${i + 1}`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Опустить этап ${i + 1}`}
                disabled={i === stages.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Удалить этап ${i + 1}`}
                disabled={stages.length === 1}
                onClick={() => setStages((rows) => rows.filter((_, j) => j !== i))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="button"
          disabled={stages.length >= 25}
          onClick={() => setStages([...stages, { name: '', color: '#3498db' }])}
        >
          <Plus size={16} />
          Добавить этап
        </button>
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
