export type Role = 'owner' | 'admin' | 'trainer';
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  instructor_id: number | null;
}
export interface Client {
  id: number;
  name: string;
  phone: string;
  email: string;
  birthday: string;
  gender: string;
  city: string;
  tags: string;
  manager_id: number | null;
  archived_at: string | null;
  notes: string;
  source: string;
  created_at: string;
}
export interface Instructor {
  id: number;
  name: string;
  specialty: string;
  color: string;
}
export interface StudioClass {
  id: number;
  title: string;
  type: string;
  instructor_id: number;
  date: string;
  time: string;
  duration: number;
  capacity: number;
  room: string;
  status: 'scheduled' | 'cancelled';
}
export interface Booking {
  id: number;
  class_id: number;
  client_id: number;
  membership_id: number;
  status: 'booked' | 'attended' | 'cancelled';
  created_at: string;
}
export interface Membership {
  id: number;
  client_id: number;
  plan_id: number;
  name: string;
  total: number;
  remaining: number;
  reserved: number;
  start_date: string;
  end_date: string;
  price: number;
}
export interface Plan {
  id: number;
  name: string;
  visits: number;
  days: number;
  price: number;
  color: string;
}
export interface Payment {
  id: number;
  client_id: number;
  membership_id: number | null;
  amount: number;
  method: string;
  description: string;
  date: string;
}
export interface Data {
  user: User;
  today: string;
  demo: boolean;
  settings: Record<string, string>;
  clients: Client[];
  instructors: Instructor[];
  classes: StudioClass[];
  bookings: Booking[];
  memberships: Membership[];
  plans: Plan[];
  payments: Payment[];
  users: User[];
  staff: Pick<User, 'id' | 'name' | 'role'>[];
  sales: Sale[];
  leads: Lead[];
  funnels: Funnel[];
  stages: Stage[];
  tasks: Task[];
  duties: {
    id: number;
    manager_id: number;
    date: string;
    start_time: string;
    end_time: string;
    notes: string;
  }[];
}
export type Page =
  | 'dashboard'
  | 'tasks'
  | 'leads'
  | 'schedule'
  | 'clients'
  | 'memberships'
  | 'finance'
  | 'team'
  | 'settings';
export type Modal =
  | { type: 'client'; id?: number }
  | { type: 'client-form'; id?: number }
  | { type: 'sale'; clientId?: number; planId?: number }
  | { type: 'class'; id: number }
  | { type: 'class-form'; date?: string }
  | { type: 'employee' }
  | null;
export type Mutate = (
  path: string,
  method: string,
  body: unknown,
  message: string,
) => Promise<{ id?: number; ok?: boolean }>;

export interface Sale {
  id: number;
  client_id: number;
  description: string;
  total: number;
  paid: number;
  debt: number;
  date: string;
  category: string;
}
export interface Funnel {
  id: number;
  name: string;
}
export interface Stage {
  id: number;
  funnel_id: number;
  name: string;
  position: number;
  color: string;
}
export interface Lead {
  id: number;
  name: string;
  phone: string;
  source: string;
  date: string;
  notes: string;
  stage_id: number;
  manager_id: number | null;
  amount: number;
  tags: string;
  client_id: number | null;
  archived_at: string | null;
}
export interface ChartRow {
  name: string;
  value: number;
}
export interface Report {
  from: string;
  to: string;
  as_of: string;
  overview: {
    revenue: number;
    expenses: number;
    net: number;
    debt_period: number;
    debt_total: number;
    active_clients: number;
    expiring_memberships: number;
    ended_memberships: number;
    renewed_memberships: number;
    renewal_rate: number | null;
    registrations: number;
    visits: number;
    app_installs: null;
  };
  daily: { date: string; revenue: number; expenses: number; cumulative: number }[];
  sales: {
    categories: {
      category: string;
      revenue: number;
      count: number;
      average_check: number | null;
    }[];
    membership_kinds: ChartRow[];
    methods: ChartRow[];
    top_plans: ChartRow[];
    top_sellers: ChartRow[];
  };
  clients: {
    count: number;
    average_age: number | null;
    known_ages: number;
    visits_per_client: number | null;
    ltv: number | null;
    ages: ChartRow[];
    genders: ChartRow[];
    top_visitors: ChartRow[];
    top_ltv: ChartRow[];
  };
  classes: {
    count: number;
    capacity: number;
    bookings: number;
    occupancy: number | null;
    attendance: number | null;
    finished_bookings: number;
    top_classes: ChartRow[];
    occupancy_by_class: {
      name: string;
      value: number;
      occupancy: number | null;
      bookings: number;
      capacity: number;
    }[];
    top_trainers: ChartRow[];
  };
  marketing: {
    leads: number;
    archived: number;
    converted: number;
    paid: number;
    conversion: number | null;
    sources: ChartRow[];
    channels: {
      name: string;
      leads: number;
      converted: number;
      conversion: number | null;
      revenue: number;
    }[];
  };
  debts: (Sale & { client_name: string })[];
  expenses: { id: number; description: string; category: string; amount: number; date: string }[];
}

export interface Task {
  id: number;
  title: string;
  type: string;
  due_date: string;
  due_time: string;
  manager_id: number | null;
  client_id: number | null;
  lead_id: number | null;
  notes: string;
  status: 'open' | 'done';
  completed_at: string | null;
  created_at: string;
}

export type ScheduleView = 'schedule' | 'duties' | 'instructors' | 'rooms' | 'bookings';
