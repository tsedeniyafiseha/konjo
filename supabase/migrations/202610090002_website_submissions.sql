begin;

create table if not exists public.website_contact_messages (
  id uuid primary key,
  full_name text not null check (char_length(full_name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200),
  topic text not null check (topic in ('general', 'careers', 'partnerships')),
  message text not null check (char_length(message) between 1 and 3000),
  recipient text not null,
  status text not null default 'new' check (status in ('new', 'replied', 'closed')),
  submitted_at timestamptz not null default now()
);

create index if not exists website_contact_messages_status_submitted_idx
on public.website_contact_messages (status, submitted_at desc);

alter table public.website_contact_messages enable row level security;
revoke all on table public.website_contact_messages from anon, authenticated;
grant all on table public.website_contact_messages to service_role;

create table if not exists public.website_professional_applications (
  id uuid primary key,
  full_name text not null check (char_length(full_name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200),
  phone text not null check (char_length(phone) between 1 and 30),
  location text not null check (char_length(location) between 1 and 100),
  specialties text not null check (char_length(specialties) between 1 and 240),
  languages text not null check (char_length(languages) between 1 and 120),
  years_experience integer not null check (years_experience between 0 and 60),
  introduction text not null check (char_length(introduction) between 1 and 1200),
  files jsonb not null check (jsonb_typeof(files) = 'array'),
  status text not null default 'new' check (status in ('new', 'reviewing', 'contacted', 'closed')),
  submitted_at timestamptz not null default now()
);

create index if not exists website_professional_applications_status_submitted_idx
on public.website_professional_applications (status, submitted_at desc);

alter table public.website_professional_applications enable row level security;
revoke all on table public.website_professional_applications from anon, authenticated;
grant all on table public.website_professional_applications to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-professional-applications',
  'website-professional-applications',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
