import { useState, type FormEvent } from 'react';
import { ArrowRight, Flower2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { api, roleLabel } from './lib';
import { Field, Logo } from './components';
import type { Role } from './types';

export default function Auth({
  status,
  onLogin,
}: {
  status: { demo: boolean; needsSetup: boolean; studioName: string };
  onLogin: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api(
        status.needsSetup ? '/auth/setup' : '/auth/login',
        'POST',
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demo(role: Role) {
    setError('');
    setBusy(true);
    try {
      await api('/auth/demo', 'POST', { role });
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo />
        <div className="auth-story-body">
          <span className="eyebrow">БОЛЬШЕ ВРЕМЕНИ ДЛЯ ГЛАВНОГО</span>
          <h1>
            Всё в ритме
            <br />
            вашей студии<span>.</span>
          </h1>
          <p>
            Забота о клиентах начинается с порядка.
            <br />
            Расписание, абонементы и команда —<br />в одном спокойном пространстве.
          </p>
          <div className="auth-art">
            <Flower2 strokeWidth={0.65} />
            <div className="floating-tag tag-one">
              <Users size={18} />
              Каждый клиент на своём месте
            </div>
            <div className="floating-tag tag-two">
              <Sparkles size={18} />
              Движение с удовольствием
            </div>
          </div>
        </div>
        <span className="auth-footer">Создано для небольших студий с большим сердцем</span>
      </div>
      <main className="auth-form-wrap">
        <div className="auth-form">
          <div className="small-mark">
            <Flower2 size={29} strokeWidth={1.3} />
          </div>
          <h2>{status.needsSetup ? 'Начнём с вашей студии' : 'Рады видеть вас'}</h2>
          <p>
            {status.needsSetup
              ? 'Создайте учётную запись владельца.'
              : `Войдите в пространство студии «${status.studioName}».`}
          </p>
          {status.demo && (
            <div className="demo-login">
              <span className="eyebrow">ПОЗНАКОМЬТЕСЬ С CRM</span>
              <p>
                Демонстрационная студия уже ждёт вас.
                <br />
                Выберите, с какой стороны посмотреть.
              </p>
              <button
                className="button primary demo-main"
                disabled={busy}
                onClick={() => demo('owner')}
              >
                Войти как владелец
                <ArrowRight size={18} />
              </button>
              <div className="demo-roles">
                {(['admin', 'trainer'] as Role[]).map((role) => (
                  <button className="button" key={role} disabled={busy} onClick={() => demo(role)}>
                    {roleLabel[role]}
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
              <small>Только вымышленные данные. Изменения сохраняются.</small>
            </div>
          )}
          {status.demo && (
            <div className="divider">
              <span>или войдите в свой аккаунт</span>
            </div>
          )}
          <form onSubmit={login}>
            {status.needsSetup && (
              <>
                <Field label="Название студии">
                  <input name="studio_name" defaultValue="Линия" maxLength={60} required />
                </Field>
                <Field label="Ваше имя">
                  <input name="name" autoComplete="name" maxLength={150} required />
                </Field>
              </>
            )}
            <Field label="Email">
              <input
                name="email"
                type="email"
                placeholder="name@studio.ru"
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Пароль">
              <input
                name="password"
                type="password"
                placeholder={status.needsSetup ? 'Не менее 10 символов' : 'Введите пароль'}
                minLength={status.needsSetup ? 10 : 1}
                maxLength={200}
                autoComplete={status.needsSetup ? 'new-password' : 'current-password'}
                required
              />
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className={`button ${status.demo ? '' : 'primary'} auth-submit`}
              disabled={busy}
            >
              {busy ? 'Подождите…' : status.needsSetup ? 'Создать студию' : 'Войти'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-security">
            <ShieldCheck size={15} />
            Доступ по роли · Данные вашей студии
          </div>
        </div>
      </main>
    </div>
  );
}
