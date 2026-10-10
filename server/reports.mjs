import { shiftDate } from './db.mjs';
import { readReceipts } from './ledger.mjs';

const total = (rows) => rows.reduce((s, r) => s + r.amount, 0);
const percent = (n, d) => (d ? Math.round((n / d) * 10000) / 100 : null);
const avg = (n, d) => (d ? Math.round((n / d) * 100) / 100 : null);
function group(rows, name, value = () => 1) {
  const result = new Map();
  for (const row of rows) {
    const key = name(row);
    result.set(key, (result.get(key) || 0) + value(row));
  }
  return [...result]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ru'));
}
export function buildReports(db, from, to, now = new Date()) {
  const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);
  const asOf = to < currentDate ? to : currentDate;
  const inPeriod = (date) => date >= from && date <= to;
  const allClients = db.prepare('SELECT * FROM clients WHERE created_at<=?').all(asOf);
  const clientById = new Map(allClients.map((c) => [c.id, c]));
  const allMembers = db.prepare('SELECT * FROM memberships ORDER BY start_date,id').all();
  const allClasses = db.prepare("SELECT * FROM classes WHERE status='scheduled'").all();
  const classById = new Map(allClasses.map((c) => [c.id, c]));
  const allBookings = db.prepare("SELECT * FROM bookings WHERE status!='cancelled'").all();
  const allVisits = allBookings.filter(
    (b) =>
      b.status === 'attended' &&
      classById.has(b.class_id) &&
      classById.get(b.class_id).date <= asOf,
  );
  const visits = allVisits.filter((b) => inPeriod(classById.get(b.class_id).date));
  const receipts = readReceipts(db).filter((p) => p.date <= asOf);
  const periodReceipts = receipts.filter((p) => inPeriod(p.date));
  const allSales = db.prepare('SELECT * FROM sales WHERE date<=? ORDER BY date,id').all(asOf);
  const periodSales = allSales.filter((s) => inPeriod(s.date));
  const paidBySale = new Map();
  for (const p of receipts) paidBySale.set(p.sale_id, (paidBySale.get(p.sale_id) || 0) + p.amount);
  const debts = allSales
    .map((s) => ({
      ...s,
      paid: paidBySale.get(s.id) || 0,
      debt: Math.max(0, s.total - (paidBySale.get(s.id) || 0)),
    }))
    .filter((s) => s.debt > 0);
  const expenses = db
    .prepare('SELECT * FROM expenses WHERE date>=? AND date<=? ORDER BY date DESC,id DESC')
    .all(from, asOf);
  const saleByMember = new Map(
    allSales.filter((s) => s.membership_id).map((s) => [s.membership_id, s]),
  );
  const memberStates = allMembers
    .filter((m) => saleByMember.has(m.id))
    .map((m) => {
      const used = allVisits
        .filter((v) => v.membership_id === m.id)
        .sort((a, b) =>
          classById.get(a.class_id).date.localeCompare(classById.get(b.class_id).date),
        );
      const expires = shiftDate(m.end_date, 1);
      const completed =
        used.length >= m.total ? classById.get(used[m.total - 1].class_id).date : null;
      const ended = completed && completed < expires ? completed : expires;
      return {
        ...m,
        remaining_as_of: Math.max(0, m.total - used.length),
        ended,
        active: m.start_date <= asOf && ended > asOf,
      };
    });
  const active = memberStates.filter((m) => m.active);
  const ending = active.filter((m) => m.end_date <= shiftDate(asOf, 7) || m.remaining_as_of <= 2);
  const ended = memberStates.filter((m) => m.ended <= asOf && inPeriod(m.ended));
  const renewed = ended.filter((m) =>
    memberStates.some(
      (next) =>
        next.client_id === m.client_id &&
        (next.start_date > m.start_date || (next.start_date === m.start_date && next.id > m.id)) &&
        next.start_date <= shiftDate(m.ended, 30),
    ),
  );
  const revenue = total(periodReceipts),
    spent = total(expenses);
  const days = [];
  let running = 0;
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const amount = total(periodReceipts.filter((p) => p.date === date));
    const expense = total(expenses.filter((e) => e.date === date));
    running += amount;
    days.push({ date, revenue: amount, expenses: expense, cumulative: running });
  }
  const categories = ['membership', 'service', 'product'].map((category) => {
    const sold = periodSales.filter((s) => s.category === category);
    return {
      category,
      revenue: total(periodReceipts.filter((p) => p.category === category)),
      count: sold.length,
      average_check: avg(
        sold.reduce((s, p) => s + p.total, 0),
        sold.length,
      ),
    };
  });
  const staff = new Map(
    db
      .prepare('SELECT id,name FROM users')
      .all()
      .map((u) => [u.id, u.name]),
  );
  const ages = allClients.map((c) => {
    if (!c.birthday || c.birthday > asOf) return null;
    return (
      Number(asOf.slice(0, 4)) -
      Number(c.birthday.slice(0, 4)) -
      (asOf.slice(5) < c.birthday.slice(5) ? 1 : 0)
    );
  });
  const knownAges = ages.filter((a) => a !== null);
  const lifetime = new Map();
  for (const p of receipts) lifetime.set(p.client_id, (lifetime.get(p.client_id) || 0) + p.amount);
  const classPeriod = allClasses.filter((c) => inPeriod(c.date));
  const classIds = new Set(classPeriod.map((c) => c.id));
  const periodBookings = allBookings.filter((b) => classIds.has(b.class_id));
  const cutoff = Math.min(now.getTime(), new Date(`${to}T23:59:59+03:00`).getTime());
  const finished = new Set(
    classPeriod
      .filter(
        (c) => new Date(`${c.date}T${c.time}:00+03:00`).getTime() + c.duration * 60000 <= cutoff,
      )
      .map((c) => c.id),
  );
  const finishedBookings = periodBookings.filter((b) => finished.has(b.class_id));
  const capacity = classPeriod.reduce((s, c) => s + c.capacity, 0);
  const byTitle = group(classPeriod, (c) => c.title).map((row) => {
    const classes = classPeriod.filter((c) => c.title === row.name),
      ids = new Set(classes.map((c) => c.id));
    const capacity = classes.reduce((s, c) => s + c.capacity, 0),
      booked = periodBookings.filter((b) => ids.has(b.class_id)).length;
    return { ...row, capacity, bookings: booked, occupancy: percent(booked, capacity) };
  });
  const instructors = new Map(
    db
      .prepare('SELECT id,name FROM instructors')
      .all()
      .map((i) => [i.id, i.name]),
  );
  const leads = db
    .prepare('SELECT * FROM leads WHERE date>=? AND date<=? ORDER BY date DESC,id DESC')
    .all(from, asOf);
  const linked = leads.filter((l) => l.client_id && l.converted_at && l.converted_at <= asOf);
  const paidLeads = linked.filter((l) =>
    receipts.some((p) => p.lead_id === l.id && p.date >= l.date),
  );
  const sourceNames = new Set([
    ...leads.map((l) => l.source),
    ...periodReceipts.map((p) => p.source),
  ]);
  const channels = [...sourceNames].sort().map((source) => {
    const count = leads.filter((l) => l.source === source).length,
      converted = paidLeads.filter((l) => l.source === source).length;
    return {
      name: source,
      leads: count,
      converted,
      conversion: percent(converted, count),
      revenue: total(periodReceipts.filter((p) => p.source === source)),
    };
  });
  return {
    from,
    to,
    as_of: asOf,
    overview: {
      revenue,
      expenses: spent,
      net: revenue - spent,
      debt_period: debts.filter((s) => inPeriod(s.date)).reduce((n, s) => n + s.debt, 0),
      debt_total: debts.reduce((n, s) => n + s.debt, 0),
      active_clients: new Set(active.map((m) => m.client_id)).size,
      expiring_memberships: ending.length,
      ended_memberships: ended.length,
      renewed_memberships: renewed.length,
      renewal_rate: percent(renewed.length, ended.length),
      registrations: allClients.filter((c) => inPeriod(c.created_at)).length,
      visits: visits.length,
      app_installs: null,
    },
    daily: days,
    sales: {
      categories,
      membership_kinds: group(
        periodReceipts.filter((p) => p.category === 'membership'),
        (p) => p.membership_kind,
        (p) => p.amount,
      ),
      methods: group(
        periodReceipts,
        (p) => p.method,
        (p) => p.amount,
      ),
      top_plans: group(
        periodReceipts.filter((p) => p.category === 'membership'),
        (p) => p.description,
        (p) => p.amount,
      ).slice(0, 10),
      top_sellers: group(
        periodReceipts.filter((p) => p.category === 'membership'),
        (p) => staff.get(p.seller_id) || 'Не указан',
        (p) => p.amount,
      ).slice(0, 10),
    },
    clients: {
      count: allClients.length,
      average_age: avg(
        knownAges.reduce((s, a) => s + a, 0),
        knownAges.length,
      ),
      known_ages: knownAges.length,
      visits_per_client: avg(visits.length, allClients.length),
      ltv: avg(
        allClients.reduce((s, c) => s + (lifetime.get(c.id) || 0), 0),
        allClients.length,
      ),
      ages: group(ages, (a) =>
        a === null
          ? 'Возраст не указан'
          : a < 18
            ? 'До 18 лет'
            : a <= 20
              ? '18–20 лет'
              : a <= 30
                ? '21–30 лет'
                : a <= 40
                  ? '31–40 лет'
                  : a <= 50
                    ? '41–50 лет'
                    : '51+ лет',
      ),
      genders: group(allClients, (c) =>
        c.gender === 'female' ? 'Женщины' : c.gender === 'male' ? 'Мужчины' : 'Не указан',
      ),
      top_visitors: group(visits, (v) => String(v.client_id))
        .slice(0, 10)
        .map((r) => ({
          id: Number(r.name),
          name: clientById.get(Number(r.name))?.name || 'Клиент',
          value: r.value,
        })),
      top_ltv: allClients
        .map((c) => ({ id: c.id, name: c.name, value: lifetime.get(c.id) || 0 }))
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    },
    classes: {
      count: classPeriod.length,
      capacity,
      bookings: periodBookings.length,
      occupancy: percent(periodBookings.length, capacity),
      attendance: percent(
        finishedBookings.filter((b) => b.status === 'attended').length,
        finishedBookings.length,
      ),
      finished_bookings: finishedBookings.length,
      top_classes: byTitle.slice(0, 10),
      occupancy_by_class: [...byTitle].sort((a, b) => (b.occupancy || 0) - (a.occupancy || 0)),
      top_trainers: group(classPeriod, (c) => instructors.get(c.instructor_id) || 'Тренер').slice(
        0,
        10,
      ),
    },
    marketing: {
      leads: leads.length,
      archived: leads.filter((l) => l.archived_at && l.archived_at <= asOf).length,
      converted: linked.length,
      paid: paidLeads.length,
      conversion: percent(paidLeads.length, leads.length),
      sources: group(leads, (l) => l.source),
      channels,
    },
    debts: debts.map((s) => ({
      ...s,
      client_name: db.prepare('SELECT name FROM clients WHERE id=?').get(s.client_id).name,
    })),
    expenses,
  };
}
