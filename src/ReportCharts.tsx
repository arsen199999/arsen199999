import type { ReactNode } from 'react';
import type { ChartRow, Report } from './types';
import { money, dateLabel } from './lib';
export const number = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
export const pct = (v: number | null) => (v === null ? '—' : `${number(v)} %`);
export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <article className="report-metric">
      <div>
        {label}{' '}
        {hint && (
          <span className="metric-hint" tabIndex={0} aria-label={hint}>
            ?<span role="tooltip">{hint}</span>
          </span>
        )}
      </div>
      <strong>{value}</strong>
    </article>
  );
}
export function ChartPanel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`report-panel ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Bars({ rows, currency = false }: { rows: ChartRow[]; currency?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.length ? (
    <div className="horizontal-bars">
      {rows.map((r, i) => (
        <div key={`${r.name}-${i}`}>
          <span title={r.name}>{r.name}</span>
          <div>
            <i style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }} />
          </div>
          <b>{currency ? money(r.value) : number(r.value)}</b>
        </div>
      ))}
    </div>
  ) : (
    <p className="chart-empty">За выбранный период нет данных</p>
  );
}
const palette = [
  '#3498db',
  '#18ae85',
  '#efa600',
  '#9460b3',
  '#ea6c90',
  '#5465b5',
  '#38bfc6',
  '#df7c4d',
];
export function Donut({ rows, currency = false }: { rows: ChartRow[]; currency?: boolean }) {
  const sum = rows.reduce((a, r) => a + r.value, 0);
  let offset = 0;
  return sum > 0 ? (
    <div className="donut-layout">
      <svg viewBox="0 0 220 220" role="img" aria-label="Распределение по категориям">
        <circle cx="110" cy="110" r="78" fill="none" stroke="#edf1f5" strokeWidth="38" />
        {rows.map((r, i) => {
          const start = offset;
          offset += (r.value / sum) * 100;
          return (
            <circle
              key={i}
              cx="110"
              cy="110"
              r="78"
              pathLength="100"
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth="38"
              strokeDasharray={`${(r.value / sum) * 100} ${100 - (r.value / sum) * 100}`}
              strokeDashoffset={-start}
              transform="rotate(-90 110 110)"
            >
              <title>
                {r.name}: {currency ? money(r.value) : number(r.value)} (
                {pct((r.value / sum) * 100)})
              </title>
            </circle>
          );
        })}
        <text x="110" y="106" textAnchor="middle">
          {currency ? money(sum) : number(sum)}
        </text>
        <text x="110" y="126" textAnchor="middle" className="donut-total">
          всего
        </text>
      </svg>
      <ul>
        {rows.map((r, i) => (
          <li key={i}>
            <i style={{ background: palette[i % palette.length] }} />
            <span>
              {r.name}
              <small>
                {currency ? money(r.value) : number(r.value)} · {pct((r.value / sum) * 100)}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <p className="chart-empty">За выбранный период нет данных</p>
  );
}
export function RevenueChart({
  days,
  cumulative = false,
}: {
  days: Report['daily'];
  cumulative?: boolean;
}) {
  const max = Math.max(1, ...days.map((d) => (cumulative ? d.cumulative : d.revenue)));
  const width = 1000,
    height = 220,
    step = width / Math.max(days.length, 1);
  const points = days
    .map(
      (d, i) =>
        `${i * step + step / 2},${height - ((cumulative ? d.cumulative : d.revenue) / max) * height}`,
    )
    .join(' ');
  return (
    <>
      <div className="revenue-chart">
        <div className="chart-scale">
          {[1, 0.75, 0.5, 0.25, 0].map((n) => (
            <span key={n}>{number(Math.round(max * n))}</span>
          ))}
        </div>
        <div className="revenue-plot">
          <svg
            viewBox={`0 0 ${width} ${height + 30}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={
              cumulative ? 'Накопительная выручка по дням' : 'Фактическая выручка по дням'
            }
          >
            {[0, 0.25, 0.5, 0.75, 1].map((n) => (
              <line
                key={n}
                x1="0"
                y1={height * n}
                x2={width}
                y2={height * n}
                stroke="#e7edf3"
                strokeWidth="1"
              />
            ))}
            {cumulative && (
              <polyline
                points={points}
                stroke="#3498db"
                strokeWidth="2"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {days.map((d, i) => {
              const value = cumulative ? d.cumulative : d.revenue,
                x = i * step + step / 2,
                y = height - (value / max) * height;
              return (
                <g key={d.date}>
                  {cumulative ? (
                    <circle cx={x} cy={y} r="2.5" fill="#3498db">
                      <title>
                        {dateLabel(d.date)}: {money(value)}
                      </title>
                    </circle>
                  ) : (
                    <rect
                      x={i * step + step * 0.23}
                      y={y}
                      width={step * 0.54}
                      height={height - y}
                      fill="#3498db"
                      rx="1"
                    >
                      <title>
                        {dateLabel(d.date)}: {money(value)}
                      </title>
                    </rect>
                  )}
                  {i % Math.max(1, Math.ceil(days.length / 10)) === 0 && (
                    <text x={x} y={height + 23} textAnchor="middle">
                      {dateLabel(d.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <details className="chart-details">
        <summary>Данные по дням</summary>
        <div className="report-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Выручка</th>
                <th>Накопительная</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{dateLabel(d.date)}</td>
                  <td>{money(d.revenue)}</td>
                  <td>{money(d.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
