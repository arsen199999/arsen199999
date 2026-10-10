export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(result.error || 'Не удалось выполнить запрос.', response.status);
  return result;
}
export const money = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';
export const number = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
export const dateLabel = (
  s: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
) => new Intl.DateTimeFormat('ru-RU', options).format(new Date(s.slice(0, 10) + 'T12:00:00'));
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((x) => x[0])
    .join('');
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function endTime(time: string, duration: number) {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + duration;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export const roleLabel: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  trainer: 'Тренер',
};
export const methods: Record<string, string> = {
  card: 'Карта',
  cash: 'Наличные',
  transfer: 'Перевод',
};
export const typeNames: Record<string, string> = {
  soft: 'Мягкая растяжка',
  stretch: 'Стретчинг',
  pilates: 'Пилатес',
  split: 'Шпагат',
  back: 'Здоровая спина',
};
export const typeColors: Record<string, string> = {
  soft: 'green',
  stretch: 'purple',
  pilates: 'peach',
  split: 'pink',
  back: 'blue',
};
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv =
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value);
            const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(';'),
      )
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
