create table if not exists public.users (
  id bigserial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id bigserial primary key,
  name text not null unique
);

create table if not exists public.roles (
  id bigserial primary key,
  name text not null unique
);

create table if not exists public.units (
  id bigserial primary key,
  name text not null unique,
  city text
);

create table if not exists public.employees (
  id bigserial primary key,
  name text not null,
  email text not null unique,
  phone text,
  admission_date date,
  status text not null default 'Ativo',
  department_id bigint references public.departments(id),
  role_id bigint references public.roles(id),
  unit_id bigint references public.units(id),
  leader_id bigint references public.employees(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.disc_profiles (
  id bigserial primary key,
  employee_id bigint not null unique references public.employees(id) on delete cascade,
  dominance integer not null default 0,
  influence integer not null default 0,
  stability integer not null default 0,
  compliance integer not null default 0,
  primary_profile text not null,
  notes text,
  assessed_at timestamptz not null default now()
);

create table if not exists public.feedbacks (
  id bigserial primary key,
  employee_id bigint not null references public.employees(id) on delete cascade,
  author_id bigint references public.users(id),
  type text not null check (type in ('Positivo', 'Corretivo', 'Desenvolvimento')),
  title text not null,
  description text not null,
  action_plan text,
  feedback_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.development_plans (
  id bigserial primary key,
  employee_id bigint not null references public.employees(id) on delete cascade,
  objective text not null,
  action text not null,
  deadline date,
  status text not null default 'Em andamento'
);

alter table public.users enable row level security;
alter table public.departments enable row level security;
alter table public.roles enable row level security;
alter table public.units enable row level security;
alter table public.employees enable row level security;
alter table public.disc_profiles enable row level security;
alter table public.feedbacks enable row level security;
alter table public.development_plans enable row level security;

insert into public.users (name, email, password_hash, role)
values (
  'Admin EPI',
  'admin@epi.com',
  'redeepiadminseed2026$509dd8404dc5fbc9b62cedec43eecefb9c0bb976a690de23ccdb83b459c418d3',
  'admin'
)
on conflict (email) do nothing;

insert into public.departments (name)
values ('Comercial'), ('Compras'), ('Logistica')
on conflict (name) do nothing;

insert into public.roles (name)
values
  ('Gerente de Operacoes'),
  ('Supervisor Comercial'),
  ('Vendedor 1C'),
  ('Vendedor 2A'),
  ('Vendedor 2B'),
  ('Vendedor 2C'),
  ('Vendedor 3A'),
  ('Vendedor 3B'),
  ('Vendedor 3C'),
  ('Assistente Administrativo'),
  ('Supervisor de Compras'),
  ('Analista de Compras Junior'),
  ('Analista de Compras Pleno'),
  ('Analista de Compras Senior'),
  ('Coordenador do Estoque'),
  ('Encarregado do Estoque'),
  ('Analista da Logistica'),
  ('Auxiliar de Estoque Junior'),
  ('Auxiliar de Estoque Pleno'),
  ('Auxiliar de Estoque Senior'),
  ('Motorista Junior'),
  ('Motorista Pleno'),
  ('Motorista Senior')
on conflict (name) do nothing;

insert into public.units (name, city)
values
  ('REDE - GO', 'Goiania'),
  ('REDE - DF', 'Brasilia'),
  ('REDE - MT', 'Cuiaba'),
  ('REDE - LABOR', 'Laboratorio')
on conflict (name) do nothing;

insert into public.employees
  (name, email, admission_date, department_id, role_id, unit_id, leader_id, notes)
select x.name, x.email, null::date, d.id, r.id, u.id, null, 'Lideranca REDE EPI'
from (
  values
    ('Leandro Daniel', 'leandro.daniel@redeepi.com', 'Comercial', 'Gerente de Operacoes', 'REDE - GO'),
    ('Gabriela Andrade', 'gabriela.andrade@redeepi.com', 'Comercial', 'Supervisor Comercial', 'REDE - GO'),
    ('Cleber Rubeo', 'cleber.rubeo@redeepi.com', 'Comercial', 'Supervisor Comercial', 'REDE - GO'),
    ('Tercio Baldino', 'tercio.baldino@redeepi.com', 'Logistica', 'Coordenador do Estoque', 'REDE - GO'),
    ('Paulo Carvalho', 'paulo.carvalho@redeepi.com', 'Logistica', 'Coordenador do Estoque', 'REDE - GO'),
    ('Priscill Jordao', 'priscill.jordao@redeepi.com', 'Compras', 'Supervisor de Compras', 'REDE - GO')
) as x(name, email, department, role, unit)
join public.departments d on d.name = x.department
join public.roles r on r.name = x.role
join public.units u on u.name = x.unit
on conflict (email) do update set
  name = excluded.name,
  department_id = excluded.department_id,
  role_id = excluded.role_id,
  unit_id = excluded.unit_id,
  notes = excluded.notes;

insert into public.employees
  (name, email, admission_date, department_id, role_id, unit_id, leader_id, notes)
select x.name, x.email, x.admission_date::date, d.id, r.id, u.id, l.id, x.notes
from (
  values
    ('Marina Alves', 'marina.alves@empresaepi.com', '2021-03-08', 'Comercial', 'Gerente de Operacoes', 'REDE - GO', null, 'Gestao operacional'),
    ('Rafael Lima', 'rafael.lima@empresaepi.com', '2020-07-12', 'Comercial', 'Supervisor Comercial', 'REDE - GO', null, 'Lider Comercial'),
    ('Bianca Torres', 'bianca.torres@empresaepi.com', '2022-01-17', 'Compras', 'Analista de Compras Pleno', 'REDE - DF', 'priscill.jordao@redeepi.com', 'Compras'),
    ('Caio Mendes', 'caio.mendes@empresaepi.com', '2023-04-03', 'Comercial', 'Vendedor 2A', 'REDE - GO', 'gabriela.andrade@redeepi.com', 'Vendas B2B'),
    ('Fernanda Rocha', 'fernanda.rocha@empresaepi.com', '2023-09-21', 'Logistica', 'Auxiliar de Estoque Pleno', 'REDE - DF', 'tercio.baldino@redeepi.com', 'Controle de estoque')
) as x(name, email, admission_date, department, role, unit, leader_email, notes)
join public.departments d on d.name = x.department
join public.roles r on r.name = x.role
join public.units u on u.name = x.unit
left join public.employees l on l.email = x.leader_email
on conflict (email) do nothing;

insert into public.disc_profiles
  (employee_id, dominance, influence, stability, compliance, primary_profile, notes)
select e.id, x.dominance, x.influence, x.stability, x.compliance, x.primary_profile, x.notes
from (
  values
    ('marina.alves@empresaepi.com', 28, 25, 21, 26, 'C', 'Perfil analitico, orientado a processos.'),
    ('rafael.lima@empresaepi.com', 34, 29, 18, 19, 'D', 'Boa energia para metas e negociacao.'),
    ('bianca.torres@empresaepi.com', 22, 20, 33, 25, 'S', 'Forte constancia operacional.'),
    ('caio.mendes@empresaepi.com', 27, 36, 19, 18, 'I', 'Comunicacao forte com clientes.'),
    ('fernanda.rocha@empresaepi.com', 18, 20, 31, 31, 'S/C', 'Cuidadosa com rotina e qualidade.')
) as x(email, dominance, influence, stability, compliance, primary_profile, notes)
join public.employees e on e.email = x.email
on conflict (employee_id) do nothing;

insert into public.feedbacks
  (employee_id, author_id, type, title, description, action_plan, feedback_date)
select e.id, u.id, x.type, x.title, x.description, x.action_plan, x.feedback_date::date
from (
  values
    ('caio.mendes@empresaepi.com', 'Positivo', 'Excelente recuperacao de carteira', 'Reativou clientes inativos no segmento de luvas e calcados.', 'Compartilhar abordagem na reuniao comercial.', '2026-05-20'),
    ('fernanda.rocha@empresaepi.com', 'Desenvolvimento', 'Aprimorar uso do ERP', 'Precisa ganhar velocidade no fechamento de divergencias.', 'Treinamento com a lideranca por 30 dias.', '2026-05-27'),
    ('rafael.lima@empresaepi.com', 'Corretivo', 'Padronizar devolutivas', 'Algumas conversas ficaram sem registro formal.', 'Registrar feedbacks ate 24h apos a conversa.', '2026-06-02')
) as x(email, type, title, description, action_plan, feedback_date)
join public.employees e on e.email = x.email
cross join public.users u
where u.email = 'admin@epi.com'
  and not exists (
    select 1 from public.feedbacks f
    where f.employee_id = e.id and f.title = x.title and f.feedback_date = x.feedback_date::date
  );

insert into public.development_plans
  (employee_id, objective, action, deadline, status)
select e.id, x.objective, x.action, x.deadline::date, x.status
from (
  values
    ('caio.mendes@empresaepi.com', 'Evoluir para contas estrategicas', 'Acompanhar 5 visitas com Rafael.', '2026-08-30', 'Em andamento'),
    ('fernanda.rocha@empresaepi.com', 'Aumentar autonomia no ERP', 'Concluir trilha de movimentacao fiscal.', '2026-07-15', 'Em andamento')
) as x(email, objective, action, deadline, status)
join public.employees e on e.email = x.email
where not exists (
  select 1 from public.development_plans p
  where p.employee_id = e.id and p.objective = x.objective
);
