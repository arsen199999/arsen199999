import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  ListChecks,
  Tags,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Flower2,
  HelpCircle,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Search,
  Settings2,
  Users,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import Auth from './Auth';
import Dashboard from './Dashboard';
import Reports from './Reports';
import ScheduleViews, { scheduleItems } from './ScheduleViews';
import Leads from './Leads';
import Tasks from './Tasks';
import ClientDirectory from './ClientDirectory';
import Modals from './Modals';
import { Clients, Finance, Memberships, Settings, Team } from './Pages';
import { Avatar, Empty, Logo, ModalFrame } from './components';
import { api, ApiError, dateLabel, roleLabel, shiftDate } from './lib';
import type { Data, Modal, Page, ScheduleView } from './types';

const navigation = [
  { id: 'dashboard', label: 'Рабочий стол', icon: LayoutDashboard },
  { id: 'leads', label: 'Заявки', icon: Tags },
  { id: 'tasks', label: 'Задачи', icon: ListChecks },
  { id: 'schedule', label: 'График и расписание', icon: CalendarDays },
  { id: 'clients', label: 'Клиенты', icon: Users },
  { id: 'memberships', label: 'Абонементы', icon: CreditCard },
  { id: 'finance', label: 'Финансы', icon: Wallet },
  { id: 'team', label: 'Команда', icon: UsersRound },
] as const;

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [auth, setAuth] = useState<{
    demo: boolean;
    needsSetup: boolean;
    studioName: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('schedule');
  const [scheduleMenu, setScheduleMenu] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState('');
  const [mobile, setMobile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [searchKey, setSearchKey] = useState(0);
  const closeModal = useCallback(() => setModal(null), []);
  const closeHelp = useCallback(() => setHelp(false), []);
  const refresh = useCallback(async () => {
    const next = await api<Data>('/bootstrap');
    setData(next);
    setAuth(null);
  }, []);
  const initialize = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        try {
          setAuth(await api('/auth/status'));
        } catch {
          setError('Не удалось подключиться к CRM. Проверьте, что сервер запущен.');
        }
      } else setError('Не удалось загрузить студию. Попробуйте обновить страницу.');
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  function navigate(next: Page) {
    setPage(next);
    if (next === 'schedule') setScheduleView('schedule');
    setMobile(false);
    setNotifications(false);
    setClientSearch('');
    setSearchKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  }
  async function mutate(path: string, method: string, body: unknown, message: string) {
    try {
      const result = await api<{ id?: number; ok?: boolean }>(path, method, body);
      await refresh();
      setToast(message);
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setModal(null);
        await initialize();
      }
      throw e;
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST', {});
      setData(null);
      setModal(null);
      setPage('dashboard');
      await initialize();
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="loading-page">
        <Logo />
        <LoaderCircle className="spin" size={26} />
        <p>Готовим пространство вашей студии…</p>
      </div>
    );
  if (error)
    return (
      <div className="loading-page">
        <Logo />
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => void initialize()}>
          Повторить подключение
        </button>
      </div>
    );
  if (!data && auth) return <Auth status={auth} onLogin={refresh} />;
  if (!data) return null;
  const trainer = data.user.role === 'trainer';
  const expiring = data.memberships.filter(
    (m) =>
      m.remaining > 0 &&
      m.start_date <= data.today &&
      m.end_date >= data.today &&
      m.end_date <= shiftDate(data.today, 7),
  );
  const pending = data.classes.filter(
    (c) =>
      c.status !== 'cancelled' &&
      c.date === data.today &&
      data.bookings.some((b) => b.class_id === c.id && b.status === 'booked'),
  );
  const alertCount = trainer ? pending.length : expiring.length;
  const content =
    page === 'dashboard' ? (
      trainer ? (
        <Dashboard data={data} navigate={navigate} open={setModal} />
      ) : (
        <Reports data={data} mutate={mutate} open={setModal} />
      )
    ) : page === 'leads' && !trainer ? (
      <Leads data={data} mutate={mutate} open={setModal} />
    ) : page === 'tasks' && !trainer ? (
      <Tasks data={data} mutate={mutate} open={setModal} />
    ) : page === 'schedule' ? (
      <ScheduleViews
        key={scheduleView}
        view={scheduleView}
        data={data}
        open={setModal}
        mutate={mutate}
      />
    ) : page === 'clients' ? (
      trainer ? (
        <Clients key={searchKey} data={data} open={setModal} initialSearch={clientSearch} />
      ) : (
        <ClientDirectory
          key={searchKey}
          data={data}
          open={setModal}
          mutate={mutate}
          initialSearch={clientSearch}
        />
      )
    ) : page === 'memberships' && !trainer ? (
      <Memberships data={data} open={setModal} />
    ) : page === 'finance' && !trainer ? (
      <Finance data={data} open={setModal} />
    ) : page === 'team' && !trainer ? (
      <Team data={data} open={setModal} />
    ) : page === 'settings' && data.user.role === 'owner' ? (
      <Settings
        data={data}
        save={async (...args) => {
          await mutate(...args);
        }}
      />
    ) : null;
  return (
    <div className="app-shell">
      {mobile && <div className="sidebar-overlay" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="icon-button mobile-close"
            aria-label="Закрыть меню"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="studio-switch">
          <div className="studio-letter">{data.settings.studio_name[0]}</div>
          <div>
            <strong>{data.settings.studio_name}</strong>
            <span>{data.settings.subtitle}</span>
          </div>
          <span className="studio-live" title="Одна студия" />
        </div>
        <div className="nav-caption">ПРОСТРАНСТВО СТУДИИ</div>
        <nav>
          {navigation
            .filter((n) => !trainer || ['dashboard', 'schedule', 'clients'].includes(n.id))
            .map((n) => (
              <div
                key={n.id}
                className={`nav-item ${n.id === 'schedule' ? 'schedule-nav' : ''}`}
                onMouseEnter={() => !mobile && n.id === 'schedule' && setScheduleMenu(true)}
                onMouseLeave={() => !mobile && n.id === 'schedule' && setScheduleMenu(false)}
                onBlur={(e) => {
                  if (n.id === 'schedule' && !e.currentTarget.contains(e.relatedTarget))
                    setScheduleMenu(false);
                }}
              >
                <button
                  className={page === n.id ? 'active' : ''}
                  aria-expanded={n.id === 'schedule' ? scheduleMenu : undefined}
                  aria-controls={n.id === 'schedule' ? 'schedule-submenu' : undefined}
                  onClick={() => {
                    if (n.id === 'schedule' && mobile) {
                      setScheduleMenu((v) => !v);
                      return;
                    }
                    navigate(n.id);
                    if (n.id === 'schedule') setScheduleMenu(true);
                  }}
                  onFocus={() => !mobile && n.id === 'schedule' && setScheduleMenu(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setScheduleMenu(false);
                  }}
                >
                  <n.icon size={19} strokeWidth={1.7} />
                  <span>{trainer && n.id === 'dashboard' ? 'Мой день' : n.label}</span>
                  {n.id === 'schedule' && <ChevronRight size={14} />}
                </button>
                {n.id === 'schedule' && scheduleMenu && (
                  <div
                    id="schedule-submenu"
                    className="schedule-submenu"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setScheduleMenu(false);
                    }}
                  >
                    {scheduleItems
                      .filter(
                        (item) =>
                          !trainer || ['schedule', 'instructors', 'bookings'].includes(item.id),
                      )
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            navigate('schedule');
                            setScheduleView(item.id);
                            setScheduleMenu(false);
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Flower2 size={23} strokeWidth={1.2} />
            <p>
              Всё начинается
              <br />с заботы о себе.
            </p>
          </div>
          {data.user.role === 'owner' && (
            <button
              className={`sidebar-tool ${page === 'settings' ? 'active' : ''}`}
              onClick={() => navigate('settings')}
            >
              <Settings2 size={18} />
              Настройки студии
            </button>
          )}
          <button className="sidebar-tool" onClick={() => setHelp(true)}>
            <HelpCircle size={18} />
            Помощь и начало работы
          </button>
          <div className="sidebar-user">
            <Avatar name={data.user.name} />
            <div>
              <strong>{data.user.name.split(' ')[0]}</strong>
              <span>{roleLabel[data.user.role]}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Выйти из аккаунта"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
          {data.demo && (
            <span className="demo-label">
              <span />
              Демонстрационная студия
            </span>
          )}
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-toggle"
              aria-label="Открыть меню"
              onClick={() => {
                setScheduleMenu(false);
                setMobile(true);
              }}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Моя студия
              <ChevronRight size={13} />
              <strong>
                {page === 'settings' ? 'Настройки' : navigation.find((n) => n.id === page)?.label}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                setPage('clients');
                setClientSearch(search);
                setSearchKey((k) => k + 1);
                setSearch('');
              }}
            >
              <Search size={16} />
              <input
                aria-label="Поиск клиента"
                placeholder="Найти клиента…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <span className="topbar-date">
              <CalendarDays size={15} />
              {dateLabel(data.today, { day: 'numeric', month: 'long' })}
            </span>
            <div className="notification-wrap">
              <button
                className={`icon-button notification-button ${notifications ? 'selected' : ''}`}
                aria-label="Уведомления"
                aria-expanded={notifications}
                onClick={() => setNotifications((v) => !v)}
              >
                <Bell size={20} />
                {alertCount > 0 && <i />}
              </button>
              {notifications && (
                <div className="notifications">
                  <div>
                    <h3>На заметку</h3>
                    <button
                      className="icon-button"
                      aria-label="Закрыть уведомления"
                      onClick={() => setNotifications(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {trainer
                    ? pending.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setModal({ type: 'class', id: c.id });
                            setNotifications(false);
                          }}
                        >
                          <CalendarDays size={19} />
                          <span>
                            <strong>{c.title}</strong>
                            <small>{c.time} · отметьте посещения</small>
                          </span>
                        </button>
                      ))
                    : expiring.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setModal({ type: 'client', id: m.client_id });
                            setNotifications(false);
                          }}
                        >
                          <CreditCard size={19} />
                          <span>
                            <strong>{data.clients.find((c) => c.id === m.client_id)?.name}</strong>
                            <small>Абонемент до {dateLabel(m.end_date)}</small>
                          </span>
                        </button>
                      ))}
                  {!alertCount && (
                    <Empty title="Всё под контролем" text="Срочных напоминаний нет." />
                  )}
                </div>
              )}
            </div>
            <Avatar name={data.user.name} size="topbar-avatar" />
          </div>
        </header>
        <main className="content" key={page}>
          {content}
        </main>
        <footer className="app-footer">
          <span>Линия · С заботой о вашей студии</span>
          <span>Одна студия. Всё под рукой.</span>
        </footer>
      </div>
      {modal && (
        <Modals
          key={JSON.stringify(modal)}
          modal={modal}
          data={data}
          close={closeModal}
          open={setModal}
          mutate={mutate}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Закрыть сообщение"
            onClick={() => setToast('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {help && (
        <ModalFrame
          title="Добро пожаловать в Линию"
          subtitle="Чуть меньше рутины, чуть больше движения"
          onClose={closeHelp}
        >
          <ol className="help-steps">
            <li>
              <strong>Познакомьтесь с клиентом</strong>
              <p>В разделе «Клиенты» добавьте имя, телефон и полезные заметки.</p>
            </li>
            <li>
              <strong>Оформите абонемент</strong>
              <p>
                Выберите тариф и способ уже полученной оплаты. Продажа автоматически попадёт в
                финансы.
              </p>
            </li>
            <li>
              <strong>Найдите время для занятия</strong>
              <p>
                Добавьте занятие в расписание, откройте его и запишите клиента. CRM проверит места и
                остаток абонемента.
              </p>
            </li>
            <li>
              <strong>Отметьте посещение</strong>
              <p>
                В день занятия администратор или тренер отмечает участников. С абонемента
                списывается одно занятие.
              </p>
            </li>
          </ol>
          <div className="notice">
            <p>
              Тренер видит свои занятия и участников. Владелец добавляет сотрудников в разделе
              «Команда» и меняет данные студии в настройках.
            </p>
          </div>
          <button className="button primary" onClick={closeHelp}>
            Всё понятно
            <CheckCircle2 size={17} />
          </button>
        </ModalFrame>
      )}
    </div>
  );
}
