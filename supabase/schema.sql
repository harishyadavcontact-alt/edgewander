create table if not exists traveler_profiles (
  traveler_id uuid primary key references auth.users (id) on delete cascade,
  payload_json jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists trip_sessions (
  traveler_id uuid not null references auth.users (id) on delete cascade,
  city text not null,
  trip_start_date date not null,
  payload_json jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (traveler_id, city, trip_start_date)
);

create table if not exists editorial_states (
  traveler_id uuid primary key references auth.users (id) on delete cascade,
  payload_json jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table traveler_profiles enable row level security;
alter table trip_sessions enable row level security;
alter table editorial_states enable row level security;

create policy "anonymous travelers manage own profile"
on traveler_profiles
for all
using (auth.uid() = traveler_id)
with check (auth.uid() = traveler_id);

create policy "anonymous travelers manage own sessions"
on trip_sessions
for all
using (auth.uid() = traveler_id)
with check (auth.uid() = traveler_id);

create policy "anonymous travelers manage own editorial state"
on editorial_states
for all
using (auth.uid() = traveler_id)
with check (auth.uid() = traveler_id);

create table if not exists ingestion_candidates (
  id text primary key,
  source_type text not null,
  source_id text not null,
  city text not null,
  query text not null,
  payload_json jsonb not null,
  verification_status text not null,
  editorial_status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists candidate_reviews (
  id bigint generated always as identity primary key,
  candidate_id text not null references ingestion_candidates (id) on delete cascade,
  action text not null,
  target_node_id text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists source_mappings (
  node_id text primary key,
  source_type text not null,
  source_id text not null unique,
  published_at timestamptz not null default timezone('utc', now())
);
