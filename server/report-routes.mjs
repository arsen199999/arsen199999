import { today, transaction } from './db.mjs';
import { addSale } from './ledger.mjs';
import { buildReports } from './reports.mjs';

export function registerReports(app, db, { office, fail, required, optional, integer, validDate }) {
  const date = (value) => {
    const d = validDate(value || today());
    if (d > today() || d < '2000-01-01')
      fail('Дата должна быть между 2000 годом и сегодняшним днём.');
    return d;
  };
  const method = (value) => {
    if (!['card', 'cash', 'transfer'].includes(value)) fail('Выберите способ оплаты.');
    return value;
  };
  const client = (value) => {
    const id = integer(value, 'Клиент');
    if (!db.prepare('SELECT 1 FROM clients WHERE id=?').get(id)) fail('Клиент не найден.', 404);
    return id;
  };
  const stage = (value) => {
    const id = integer(value, 'Этап');
    if (!db.prepare('SELECT 1 FROM stages WHERE id=?').get(id)) fail('Этап не найден.', 404);
    return id;
  };
  const manager = (value) => {
    if (value === null || value === '' || value === undefined) return null;
    const id = integer(value, 'Менеджер');
    if (!db.prepare("SELECT 1 FROM users WHERE id=? AND role!='trainer'").get(id))
      fail('Менеджер не найден.');
    return id;
  };
  const phone = (value) => {
    const digits = required(value, 'Телефон', 30).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) fail('Телефон: от 10 до 15 цифр.');
    return `+${digits.length === 10 ? '7' + digits : digits.length === 11 && digits[0] === '8' ? '7' + digits.slice(1) : digits}`;
  };
  app.get('/api/reports', office, (req, res) => {
    const from = validDate(req.query.from),
      to = validDate(req.query.to);
    if (
      from > to ||
      from > today() ||
      from < '2000-01-01' ||
      Date.parse(to) - Date.parse(from) > 366 * 86400000
    )
      fail('Выберите период до одного года с началом не позже сегодняшнего дня.');
    res.json(buildReports(db, from, to));
  });
  app.post('/api/expenses', office, (req, res) => {
    const id = db
      .prepare(
        'INSERT INTO expenses(description,category,amount,date,created_by) VALUES (?,?,?,?,?)',
      )
      .run(
        required(req.body.description, 'Описание'),
        required(req.body.category, 'Категория', 60),
        integer(req.body.amount, 'Сумма'),
        date(req.body.date),
        req.user.id,
      ).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  app.post('/api/sales', office, (req, res) => {
    const b = req.body,
      clientId = client(b.client_id),
      total = integer(b.total, 'Стоимость'),
      paid = integer(b.paid_amount ?? total, 'Получено', 0, total);
    if (!['service', 'product'].includes(b.category)) fail('Выберите услугу или товар.');
    const params = {
      clientId,
      category: b.category,
      description: required(b.description, 'Наименование'),
      total,
      paid,
      method: method(b.method),
      date: date(b.date),
      userId: req.user.id,
    };
    const id = transaction(db, () => addSale(db, params));
    res.status(201).json({ id });
  });
  app.post('/api/sales/:id/payments', office, (req, res) => {
    const id = integer(req.params.id, 'Продажа'),
      amount = integer(req.body.amount, 'Сумма'),
      paidDate = date(req.body.date),
      paidMethod = method(req.body.method);
    transaction(db, () => {
      const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id);
      if (!sale) fail('Продажа не найдена.', 404);
      const paid = db
        .prepare('SELECT coalesce(sum(amount),0) AS n FROM receipts WHERE sale_id=?')
        .get(id).n;
      if (amount > sale.total - paid) fail('Сумма превышает остаток долга.', 409);
      if (paidDate < sale.date) fail('Оплата не может быть раньше продажи.');
      db.prepare(
        'INSERT INTO receipts(sale_id,amount,method,date,created_by) VALUES (?,?,?,?,?)',
      ).run(id, amount, paidMethod, paidDate, req.user.id);
    });
    res.status(201).json({ id });
  });
  function leadFields(b) {
    return [
      required(b.name, 'Имя'),
      phone(b.phone),
      required(b.source, 'Источник', 60),
      date(b.date),
      optional(b.notes),
      stage(b.stage_id),
      manager(b.manager_id),
      integer(b.amount ?? 0, 'Сумма', 0),
      optional(b.tags, 200),
    ];
  }
  app.post('/api/leads', office, (req, res) => {
    const values = leadFields(req.body);
    const id = db
      .prepare(
        'INSERT INTO leads(name,phone,source,date,notes,stage_id,manager_id,amount,tags) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(...values).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  app.patch('/api/leads/:id', office, (req, res) => {
    const id = integer(req.params.id, 'Заявка'),
      existing = db.prepare('SELECT * FROM leads WHERE id=?').get(id);
    if (!existing) fail('Заявка не найдена.', 404);
    const b = req.body;
    transaction(db, () => {
      if (b.name !== undefined) {
        if (
          existing.client_id &&
          (phone(b.phone) !== existing.phone ||
            b.source !== existing.source ||
            b.date !== existing.date)
        )
          fail('У связанной с клиентом заявки нельзя менять телефон, источник и дату.');
        db.prepare(
          'UPDATE leads SET name=?,phone=?,source=?,date=?,notes=?,stage_id=?,manager_id=?,amount=?,tags=? WHERE id=?',
        ).run(...leadFields(b), id);
      } else if (b.stage_id !== undefined)
        db.prepare('UPDATE leads SET stage_id=? WHERE id=?').run(stage(b.stage_id), id);
      if (b.archived !== undefined) {
        if (typeof b.archived !== 'boolean') fail('Некорректное значение архива.');
        db.prepare('UPDATE leads SET archived_at=? WHERE id=?').run(
          b.archived ? today() : null,
          id,
        );
      }
    });
    res.json({ id });
  });
  app.post('/api/leads/:id/convert', office, (req, res) => {
    const id = integer(req.params.id, 'Заявка');
    const clientId = transaction(db, () => {
      const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(id);
      if (!lead) fail('Заявка не найдена.', 404);
      if (lead.client_id) return lead.client_id;
      const found = db.prepare('SELECT id FROM clients WHERE phone=?').get(lead.phone);
      const clientId =
        found?.id ||
        Number(
          db
            .prepare(
              'INSERT INTO clients(name,phone,source,notes,created_at,manager_id,tags) VALUES (?,?,?,?,?,?,?)',
            )
            .run(
              lead.name,
              lead.phone,
              lead.source,
              lead.notes,
              today(),
              lead.manager_id,
              lead.tags,
            ).lastInsertRowid,
        );
      db.prepare("UPDATE leads SET client_id=?,converted_at=?,stage='won' WHERE id=?").run(
        clientId,
        today(),
        id,
      );
      return clientId;
    });
    res.json({ id: clientId });
  });
  app.post('/api/duties', office, (req, res) => {
    const b = req.body,
      managerId = manager(b.manager_id),
      day = validDate(b.date);
    if (!managerId) fail('Выберите сотрудника.');
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start_time) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end_time) ||
      b.start_time >= b.end_time
    )
      fail('Укажите начало и окончание дежурства в пределах одного дня.');
    const id = transaction(db, () => {
      if (
        db
          .prepare(
            'SELECT 1 FROM duties WHERE manager_id=? AND date=? AND start_time<? AND end_time>?',
          )
          .get(managerId, day, b.end_time, b.start_time)
      )
        fail('У сотрудника уже есть дежурство в это время.', 409);
      return Number(
        db
          .prepare(
            'INSERT INTO duties(manager_id,date,start_time,end_time,notes) VALUES (?,?,?,?,?)',
          )
          .run(managerId, day, b.start_time, b.end_time, optional(b.notes)).lastInsertRowid,
      );
    });
    res.status(201).json({ id });
  });
  app.delete('/api/duties/:id', office, (req, res) => {
    const id = integer(req.params.id, 'Дежурство');
    if (!db.prepare('DELETE FROM duties WHERE id=?').run(id).changes)
      fail('Дежурство не найдено.', 404);
    res.json({ id });
  });
  const taskFields = (b) => {
    const type = b.type;
    if (!['call', 'meeting', 'task'].includes(type)) fail('Выберите тип задачи.');
    const due = validDate(b.due_date),
      time = required(b.due_time, 'Время', 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Укажите корректное время.');
    const clientId = b.client_id ? client(b.client_id) : null,
      leadId = b.lead_id ? integer(b.lead_id, 'Заявка') : null;
    if (leadId && !db.prepare('SELECT 1 FROM leads WHERE id=?').get(leadId))
      fail('Заявка не найдена.', 404);
    return [
      required(b.title, 'Задача'),
      type,
      due,
      time,
      manager(b.manager_id),
      clientId,
      leadId,
      optional(b.notes),
    ];
  };
  app.post('/api/tasks', office, (req, res) => {
    const id = db
      .prepare(
        'INSERT INTO tasks(title,type,due_date,due_time,manager_id,client_id,lead_id,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(...taskFields(req.body), new Date().toISOString()).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  });
  app.patch('/api/tasks/:id', office, (req, res) => {
    const id = integer(req.params.id, 'Задача'),
      task = db.prepare("SELECT * FROM tasks WHERE id=? AND status!='deleted'").get(id);
    if (!task) fail('Задача не найдена.', 404);
    transaction(db, () => {
      if (req.body.title !== undefined)
        db.prepare(
          'UPDATE tasks SET title=?,type=?,due_date=?,due_time=?,manager_id=?,client_id=?,lead_id=?,notes=? WHERE id=?',
        ).run(...taskFields(req.body), id);
      if (req.body.status !== undefined) {
        if (!['open', 'done', 'deleted'].includes(req.body.status))
          fail('Недопустимый статус задачи.');
        db.prepare('UPDATE tasks SET status=?,completed_at=? WHERE id=?').run(
          req.body.status,
          req.body.status === 'done' ? new Date().toISOString() : null,
          id,
        );
      }
    });
    res.json({ id });
  });
  function saveFunnel(id, b) {
    const name = required(b.name, 'Название воронки', 60);
    if (!Array.isArray(b.stages) || b.stages.length < 1 || b.stages.length > 25)
      fail('Добавьте от 1 до 25 этапов.');
    const stages = b.stages.map((s, i) => ({
      id: s.id === undefined ? null : integer(s.id, 'Этап'),
      name: required(s.name, 'Название этапа', 60),
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#3498db',
      position: i,
    }));
    const ids = stages.filter((s) => s.id).map((s) => s.id);
    if (new Set(ids).size !== ids.length) fail('Этапы не должны повторяться.');
    return transaction(db, () => {
      if (id && !db.prepare('SELECT 1 FROM funnels WHERE id=?').get(id))
        fail('Воронка не найдена.', 404);
      const old = id ? db.prepare('SELECT * FROM stages WHERE funnel_id=?').all(id) : [];
      for (const s of stages)
        if (s.id && !old.some((o) => o.id === s.id)) fail('Этап не принадлежит воронке.');
      if (!id)
        id = Number(db.prepare('INSERT INTO funnels(name) VALUES (?)').run(name).lastInsertRowid);
      else db.prepare('UPDATE funnels SET name=? WHERE id=?').run(name, id);
      for (const s of old.filter((o) => !ids.includes(o.id))) {
        if (db.prepare('SELECT 1 FROM leads WHERE stage_id=?').get(s.id))
          fail('Сначала перенесите заявки из удаляемого этапа, включая архивные.', 409);
        db.prepare('DELETE FROM stages WHERE id=?').run(s.id);
      }
      for (const s of stages) {
        if (s.id)
          db.prepare('UPDATE stages SET name=?,position=?,color=? WHERE id=?').run(
            s.name,
            s.position,
            s.color,
            s.id,
          );
        else
          db.prepare('INSERT INTO stages(funnel_id,name,position,color) VALUES (?,?,?,?)').run(
            id,
            s.name,
            s.position,
            s.color,
          );
      }
      return id;
    });
  }
  app.post('/api/funnels', office, (req, res) =>
    res.status(201).json({ id: saveFunnel(null, req.body) }),
  );
  app.patch('/api/funnels/:id', office, (req, res) =>
    res.json({ id: saveFunnel(integer(req.params.id, 'Воронка'), req.body) }),
  );
}
