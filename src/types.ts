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
  membership_id: number;
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
}
export type Page =
  'dashboard' | 'schedule' | 'clients' | 'memberships' | 'finance' | 'team' | 'settings';
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
