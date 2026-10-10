import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { Avatar, Badge, Empty, Field, ModalFrame, Submit } from './components';
import { dateLabel, endTime, methods, money, shiftDate, typeColors, typeNames } from './lib';
import type { Data, Modal, Mutate } from './types';

interface Props {
  modal: NonNullable<Modal>;
  data: Data;
  close: () => void;
  open: (m: Modal) => void;
  mutate: Mutate;
}
export default function Modals({ modal, data, close, open, mutate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedClient, setSelectedClient] = useState(
    modal.type === 'sale' && modal.clientId ? String(modal.clientId) : '',
  );
  const [selectedPlan, setSelectedPlan] = useState(
    String(
      modal.type === 'sale' && modal.planId
        ? modal.planId
        : data.plans.find((p) => p.visits === 8)?.id || data.plans[0]?.id || '',
    ),
  );
  const [selectedMember, setSelectedMember] = useState('');
  const [role, setRole] = useState('trainer');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const trainer = data.user.role === 'trainer';
  async function act(
    path: string,
    method: string,
    body: unknown,
    message: string,
    after?: (result: { id?: number }) => void,
  ) {
    setError('');
    setBusy(true);
    try {
      const result = await mutate(path, method, body, message);
      after?.(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const errorMessage = error && (
    <p className="form-error" role="alert">
      {error}
    </p>
  );
  const cancelButton = (
    <button type="button" className="button" onClick={close}>
      Отмена
    </button>
  );

  if (modal.type === 'client-form') {
    const client = data.clients.find((c) => c.id === modal.id);
    function submit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.currentTarget));
      void act(
        client ? `/clients/${client.id}` : '/clients',
        client ? 'PATCH' : 'POST',
        body,
        client ? 'Карточка клиента обновлена' : 'Клиент добавлен',
        (result) => open({ type: 'client', id: client?.id || result.id }),
      );
    }
    return (
      <ModalFrame
        title={client ? 'Редактировать клиента' : 'Новый клиент'}
        subtitle="Знакомство начинается с простых деталей"
        onClose={close}
      >
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Имя и фамилия *" className="full">
              <input
                name="name"
                placeholder="Анна Иванова"
                defaultValue={client?.name}
                maxLength={150}
                autoComplete="name"
                required
                autoFocus
              />
            </Field>
            <Field label="Телефон *">
              <input
                name="phone"
                type="tel"
                placeholder="+7 (999) 000-00-00"
                defaultValue={client?.phone}
                maxLength={30}
                autoComplete="tel"
                required
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                placeholder="anna@example.ru"
                defaultValue={client?.email}
                maxLength={150}
                autoComplete="email"
              />
            </Field>
            <Field label="Дата рождения">
              <input
                name="birthday"
                type="date"
                min="1900-01-01"
                max={data.today}
                defaultValue={client?.birthday}
              />
            </Field>
            <Field label="Как узнали о нас">
              <input
                name="source"
                defaultValue={client?.source || 'Студия'}
                maxLength={60}
                list="client-sources"
              />
              <datalist id="client-sources">
                {['Студия', 'Рекомендация', 'ВКонтакте', 'Сайт', 'Яндекс Директ'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </datalist>
            </Field>
            <Field label="Пол">
              <select name="gender" defaultValue={client?.gender || 'unknown'}>
                <option value="unknown">Не указан</option>
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
              </select>
            </Field>
            <Field label="Город">
              <input name="city" defaultValue={client?.city} maxLength={100} />
            </Field>
            <Field label="Теги">
              <input name="tags" defaultValue={client?.tags} maxLength={200} />
            </Field>
            <Field label="Менеджер">
              <select name="manager_id" defaultValue={client?.manager_id || ''}>
                <option value="">Не назначен</option>
                {data.staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Заметка" className="full">
              <textarea
                name="notes"
                rows={3}
                placeholder="Предпочтения и пожелания клиента"
                maxLength={2000}
                defaultValue={client?.notes}
              />
            </Field>
          </div>
          {errorMessage}
          <div className="form-footer">
            {cancelButton}
            <Submit busy={busy}>{client ? 'Сохранить' : 'Добавить клиента'}</Submit>
          </div>
        </form>
      </ModalFrame>
    );
  }
  if (modal.type === 'sale') {
    const plan = data.plans.find((p) => p.id === Number(selectedPlan));
    function submit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.currentTarget));
      void act('/memberships', 'POST', body, 'Абонемент оформлен, оплата записана', () =>
        open({ type: 'client', id: Number(selectedClient) }),
      );
    }
    return (
      <ModalFrame
        title="Новый абонемент"
        subtitle="Ещё один шаг к регулярным занятиям"
        onClose={close}
      >
        <form onSubmit={submit}>
          <Field label="Клиент *">
            <select
              name="client_id"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              required
            >
              <option value="">Выберите клиента</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Абонемент *">
            <select
              name="plan_id"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              required
            >
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.visits} зан. · {money(p.price)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Начало действия *">
              <input
                name="start_date"
                type="date"
                defaultValue={data.today}
                min={data.today}
                required
              />
            </Field>
            <Field label="Способ полученной оплаты *">
              <select name="method" required>
                {Object.entries(methods).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Получено, ₽">
            <input
              key={selectedPlan}
              name="paid_amount"
              type="number"
              min="0"
              max={plan?.price}
              defaultValue={plan?.price}
              required
            />
          </Field>
          {plan && (
            <div className={`sale-summary ${plan.color}`}>
              <CreditCard size={25} />
              <div>
                <strong>{plan.name}</strong>
                <span>
                  {plan.visits} занятий · срок {plan.days} дней
                </span>
              </div>
              <b>{money(plan.price)}</b>
            </div>
          )}
          <p className="form-hint">
            Укажите фактически полученную сумму. Неоплаченный остаток попадёт в задолженности на
            рабочем столе.
          </p>
          {errorMessage}
          <div className="form-footer">
            {cancelButton}
            <Submit busy={busy || !selectedClient}>Оформить и записать оплату</Submit>
          </div>
        </form>
      </ModalFrame>
    );
  }
  if (modal.type === 'class-form') {
    function submit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      void act(
        '/classes',
        'POST',
        Object.fromEntries(new FormData(e.currentTarget)),
        'Занятие добавлено в расписание',
        (result) => open({ type: 'class', id: result.id! }),
      );
    }
    return (
      <ModalFrame title="Новое занятие" subtitle="Найдём время для движения" onClose={close}>
        <form onSubmit={submit}>
          <Field label="Название занятия *">
            <input
              name="title"
              placeholder="Например, мягкая растяжка"
              maxLength={80}
              required
              autoFocus
            />
          </Field>
          <div className="form-grid">
            <Field label="Направление *">
              <select name="type">
                {Object.entries(typeNames).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Тренер *">
              <select name="instructor_id" required>
                <option value="">Выберите тренера</option>
                {data.instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дата *">
              <input
                name="date"
                type="date"
                min={data.today}
                defaultValue={modal.date && modal.date >= data.today ? modal.date : data.today}
                required
              />
            </Field>
            <Field label="Время *">
              <input name="time" type="time" defaultValue="09:00" required />
            </Field>
            <Field label="Длительность, минут *">
              <input name="duration" type="number" defaultValue={55} min={15} max={180} required />
            </Field>
            <Field label="Мест в группе *">
              <input name="capacity" type="number" defaultValue={8} min={1} max={100} required />
            </Field>
            <Field label="Зал" className="full">
              <input name="room" defaultValue="Основной зал" maxLength={60} required />
            </Field>
          </div>
          <p className="form-hint">
            Время московское. CRM проверит, чтобы зал и тренер были свободны.
          </p>
          {!data.instructors.length && (
            <p className="form-error">Сначала добавьте тренера в разделе «Команда».</p>
          )}
          {errorMessage}
          <div className="form-footer">
            {cancelButton}
            <Submit busy={busy || !data.instructors.length}>Добавить занятие</Submit>
          </div>
        </form>
      </ModalFrame>
    );
  }
  if (modal.type === 'class') {
    const klass = data.classes.find((c) => c.id === modal.id);
    if (!klass) return null;
    const instructor = data.instructors.find((i) => i.id === klass.instructor_id)!;
    const bookings = data.bookings.filter(
      (b) => b.class_id === klass.id && b.status !== 'cancelled',
    );
    const availableClients = data.clients.filter(
      (c) => !bookings.some((b) => b.client_id === c.id),
    );
    const memberships = data.memberships.filter(
      (m) =>
        m.client_id === Number(selectedClient) &&
        m.remaining - m.reserved > 0 &&
        m.start_date <= klass.date &&
        m.end_date >= klass.date,
    );
    const memberId =
      memberships.find((m) => m.id === Number(selectedMember))?.id || memberships[0]?.id;
    const canBook =
      !trainer &&
      klass.status === 'scheduled' &&
      klass.date >= data.today &&
      bookings.length < klass.capacity;
    return (
      <ModalFrame
        title={klass.title}
        subtitle={`${dateLabel(klass.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${klass.time}–${endTime(klass.time, klass.duration)}`}
        onClose={close}
        wide
      >
        <div className={`class-detail-banner ${typeColors[klass.type]}`}>
          <div className="person-cell">
            <Avatar name={instructor.name} color={instructor.color} />
            <div>
              <strong>{instructor.name}</strong>
              <span>{typeNames[klass.type]}</span>
            </div>
          </div>
          <span>
            <MapPin size={15} />
            {klass.room}
          </span>
          <span>
            <Users size={16} />
            {bookings.length} из {klass.capacity} мест
          </span>
        </div>
        {klass.status === 'cancelled' && (
          <div className="notice peach">
            Занятие отменено. Все записи отменены, занятия по абонементам не списаны.
          </div>
        )}
        <div className="roster-title">
          <h3>Участники занятия</h3>
          <span>{bookings.filter((b) => b.status === 'attended').length} посещений отмечено</span>
        </div>
        <div className="roster">
          {bookings.map((b) => {
            const c = data.clients.find((c) => c.id === b.client_id)!;
            return (
              <div className="roster-row" key={b.id}>
                <button className="person-cell" onClick={() => open({ type: 'client', id: c.id })}>
                  <Avatar name={c.name} color={['green', 'purple', 'peach'][c.id % 3]} />
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.phone}</span>
                  </div>
                </button>
                {b.status === 'attended' ? (
                  <Badge>
                    <Check size={13} />
                    Посетил(а)
                  </Badge>
                ) : (
                  <div className="roster-actions">
                    <button
                      className="button small-button"
                      disabled={busy || klass.date > data.today}
                      title={
                        klass.date > data.today
                          ? 'Можно отметить в день занятия'
                          : 'Списать одно занятие с абонемента'
                      }
                      onClick={() =>
                        void act(
                          `/bookings/${b.id}`,
                          'PATCH',
                          { status: 'attended' },
                          'Посещение отмечено, занятие списано',
                        )
                      }
                    >
                      <Check size={15} />
                      Посещение
                    </button>
                    {!trainer && (
                      <button
                        className="icon-button danger-text"
                        aria-label={`Отменить запись ${c.name}`}
                        disabled={busy}
                        onClick={() =>
                          void act(
                            `/bookings/${b.id}`,
                            'PATCH',
                            { status: 'cancelled' },
                            'Запись отменена',
                          )
                        }
                      >
                        <X size={17} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!bookings.length && (
            <Empty
              title={klass.status === 'cancelled' ? 'Записи отменены' : 'Первые места ещё свободны'}
              text={
                trainer
                  ? 'Администратор добавит участников в список.'
                  : 'Выберите клиента ниже, чтобы записать на занятие.'
              }
            />
          )}
        </div>
        {canBook && (
          <form
            className="booking-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                '/bookings',
                'POST',
                { class_id: klass.id, client_id: Number(selectedClient), membership_id: memberId },
                'Клиент записан на занятие',
                () => {
                  setSelectedClient('');
                  setSelectedMember('');
                },
              );
            }}
          >
            <h3>Записать клиента</h3>
            <Field label="Клиент">
              <select
                value={selectedClient}
                required
                onChange={(e) => {
                  setSelectedClient(e.target.value);
                  setSelectedMember('');
                }}
              >
                <option value="">Выберите клиента</option>
                {availableClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone}
                  </option>
                ))}
              </select>
            </Field>
            {selectedClient &&
              (memberships.length ? (
                <Field label="Абонемент">
                  <select value={memberId} onChange={(e) => setSelectedMember(e.target.value)}>
                    {memberships.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · свободно {m.remaining - m.reserved} зан. · до{' '}
                        {dateLabel(m.end_date)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="notice peach">
                  <p>Нет абонемента со свободными занятиями, действующего на эту дату.</p>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => open({ type: 'sale', clientId: Number(selectedClient) })}
                  >
                    Оформить абонемент
                    <ArrowRight size={15} />
                  </button>
                </div>
              ))}
            <button
              type="submit"
              className="button primary"
              disabled={busy || !memberId || !selectedClient}
            >
              <Plus size={17} />
              Записать на занятие
            </button>
          </form>
        )}
        {!trainer && bookings.length >= klass.capacity && klass.status !== 'cancelled' && (
          <div className="notice peach">Группа заполнена. Свободных мест пока нет.</div>
        )}
        {errorMessage}
        {!trainer &&
          klass.status === 'scheduled' &&
          klass.date >= data.today &&
          !bookings.some((b) => b.status === 'attended') && (
            <div className="cancel-class">
              {confirmCancel ? (
                <>
                  <p>Отменить занятие и все записи на него? Занятия по абонементам сохранятся.</p>
                  <div>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setConfirmCancel(false)}
                    >
                      Оставить занятие
                    </button>
                    <button
                      className="button danger"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          `/classes/${klass.id}/cancel`,
                          'POST',
                          {},
                          'Занятие и записи отменены',
                          close,
                        )
                      }
                    >
                      Да, отменить
                    </button>
                  </div>
                </>
              ) : (
                <button className="text-link danger-text" onClick={() => setConfirmCancel(true)}>
                  Отменить занятие
                </button>
              )}
            </div>
          )}
      </ModalFrame>
    );
  }
  if (modal.type === 'client') {
    const client = data.clients.find((c) => c.id === modal.id);
    if (!client) return null;
    const memberships = data.memberships.filter((m) => m.client_id === client.id);
    const bookings = data.bookings
      .filter((b) => b.client_id === client.id && b.status !== 'cancelled')
      .map((b) => ({ ...b, klass: data.classes.find((c) => c.id === b.class_id)! }))
      .sort(
        (a, b) =>
          b.klass.date.localeCompare(a.klass.date) || b.klass.time.localeCompare(a.klass.time),
      );
    const payments = data.payments.filter((p) => p.client_id === client.id);
    return (
      <ModalFrame title="Карточка клиента" onClose={close} wide>
        <div className="client-profile">
          <Avatar name={client.name} size="large" />
          <div>
            <h2>{client.name}</h2>
            <p>
              В студии с{' '}
              {dateLabel(client.created_at, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          {!trainer && (
            <button
              className="icon-button"
              aria-label="Редактировать клиента"
              onClick={() => open({ type: 'client-form', id: client.id })}
            >
              <Pencil size={18} />
            </button>
          )}
        </div>
        <div className="client-contacts">
          <a href={`tel:${client.phone}`}>
            <Phone size={15} />
            {client.phone}
          </a>
          {client.email && (
            <a href={`mailto:${client.email}`}>
              <Mail size={15} />
              {client.email}
            </a>
          )}
          {client.birthday && (
            <span>
              <CalendarDays size={15} />
              {dateLabel(client.birthday, { day: 'numeric', month: 'long' })}
            </span>
          )}
        </div>
        {client.notes && (
          <div className="notice">
            <strong>Заметка</strong>
            <p className="preserve-lines">{client.notes}</p>
          </div>
        )}
        {!trainer && (
          <>
            <div className="roster-title">
              <h3>Абонементы</h3>
              <button
                className="text-link"
                onClick={() => open({ type: 'sale', clientId: client.id })}
              >
                <Plus size={15} />
                Новый абонемент
              </button>
            </div>
            <div className="client-memberships">
              {memberships.length ? (
                memberships.map((m) => (
                  <div key={m.id} className="client-membership">
                    <div>
                      <CreditCard size={20} />
                      <strong>{m.name}</strong>
                      <Badge
                        color={
                          m.end_date < data.today || m.remaining === 0
                            ? 'gray'
                            : m.start_date > data.today
                              ? 'blue'
                              : 'green'
                        }
                      >
                        {m.end_date < data.today || m.remaining === 0
                          ? 'Завершён'
                          : m.start_date > data.today
                            ? 'Ожидает начала'
                            : 'Активен'}
                      </Badge>
                    </div>
                    <p>
                      <strong>{m.remaining}</strong> из {m.total} занятий осталось{' '}
                      <span>· в записи {m.reserved}</span>
                    </p>
                    <div className="mini-progress">
                      <i style={{ width: `${(m.remaining / m.total) * 100}%` }} />
                    </div>
                    <small>
                      {dateLabel(m.start_date)} —{' '}
                      {dateLabel(m.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </small>
                  </div>
                ))
              ) : (
                <Empty
                  title="Абонементов пока нет"
                  text="Оформите абонемент, чтобы записать клиента на занятие."
                />
              )}
            </div>
          </>
        )}
        <div className="roster-title">
          <h3>Записи и посещения</h3>
          <span>{bookings.filter((b) => b.status === 'attended').length} посещений</span>
        </div>
        {bookings.length ? (
          <div className="client-visits">
            {bookings.map((b) => (
              <button key={b.id} onClick={() => open({ type: 'class', id: b.class_id })}>
                <span className="visit-date">
                  {dateLabel(b.klass.date)}
                  <small>{b.klass.time}</small>
                </span>
                <strong>{b.klass.title}</strong>
                <Badge color={b.status === 'attended' ? 'green' : 'purple'}>
                  {b.status === 'attended' ? 'Посещение' : 'Записан(а)'}
                </Badge>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Здесь появится история занятий клиента.</p>
        )}
        {!trainer && payments.length > 0 && (
          <>
            <div className="roster-title">
              <h3>Оплаты</h3>
              <strong>{money(payments.reduce((s, p) => s + p.amount, 0))}</strong>
            </div>
            {payments.map((p) => (
              <div className="client-payment" key={p.id}>
                <span>
                  {dateLabel(p.date)} · {p.description}
                </span>
                <span>
                  {methods[p.method]} · <b>{money(p.amount)}</b>
                </span>
              </div>
            ))}
          </>
        )}
      </ModalFrame>
    );
  }
  if (modal.type === 'employee') {
    function submit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      void act(
        '/users',
        'POST',
        Object.fromEntries(new FormData(e.currentTarget)),
        'Учётная запись сотрудника создана',
        close,
      );
    }
    return (
      <ModalFrame
        title="Новый сотрудник"
        subtitle="Каждому — своё пространство для работы"
        onClose={close}
      >
        <form onSubmit={submit}>
          <Field label="Имя и фамилия *">
            <input name="name" maxLength={150} required autoFocus />
          </Field>
          <Field label="Email для входа *">
            <input name="email" type="email" maxLength={150} autoComplete="off" required />
          </Field>
          <Field label="Пароль *">
            <input
              name="password"
              type="password"
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              placeholder="Не менее 10 символов"
              required
            />
          </Field>
          <Field label="Роль *">
            <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="trainer">Тренер</option>
              <option value="admin">Администратор</option>
            </select>
          </Field>
          {role === 'trainer' && (
            <Field label="Направления">
              <input name="specialty" maxLength={100} placeholder="Растяжка · пилатес" />
            </Field>
          )}
          <div className="notice">
            <p>
              {role === 'trainer'
                ? 'Тренер видит только свои занятия, их участников и может отмечать посещения. Финансы и настройки недоступны.'
                : 'Администратор работает с клиентами, расписанием, абонементами и оплатами. Настройки и создание сотрудников доступны владельцу.'}
            </p>
          </div>
          <p className="form-hint">
            Передайте данные входа сотруднику лично. Автоматическая отправка писем не подключена.
          </p>
          {errorMessage}
          <div className="form-footer">
            {cancelButton}
            <Submit busy={busy}>Добавить сотрудника</Submit>
          </div>
        </form>
      </ModalFrame>
    );
  }
  return null;
}
