import { useEffect, useRef, type ReactNode, type FormEvent } from 'react';
import { ArrowUpRight, Check, ChevronRight, Flower2, LoaderCircle, Search, X } from 'lucide-react';
import { initials } from './lib';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <div className="brand-mark">
        <Flower2 size={29} strokeWidth={1.3} />
      </div>
      <div>
        <strong>
          линия<span>·</span>
        </strong>
        {!small && <p>пространство движения</p>}
      </div>
    </div>
  );
}
export function Avatar({
  name,
  color = 'purple',
  size = '',
}: {
  name: string;
  color?: string;
  size?: string;
}) {
  return <span className={`avatar ${color} ${size}`}>{initials(name)}</span>;
}
export function Badge({ children, color = 'green' }: { children: ReactNode; color?: string }) {
  return (
    <span className={`badge ${color}`}>
      <i />
      {children}
    </span>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Flower2 size={32} strokeWidth={1.3} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск',
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-field">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="icon-button" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ChevronRight size={15} />
    </button>
  );
}
export function Stat({
  title,
  value,
  detail,
  icon,
  color = 'purple',
  onClick,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  color?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="stat-card" onClick={onClick}>
      <div className="stat-top">
        <span>{title}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="stat-bottom">
        <span>{detail}</span>
        {onClick && <ArrowUpRight size={16} />}
      </div>
    </Tag>
  );
}
export function ModalFrame({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Закрыть">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Submit({ busy, children = 'Сохранить' }: { busy: boolean; children?: ReactNode }) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
      {busy ? 'Сохраняем…' : children}
    </button>
  );
}
export function formValues(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
}
