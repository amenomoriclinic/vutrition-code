-- Supabase table creation SQL for nutrition records
-- Run this in the Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.nutrition_records (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_text text,
  calories numeric,
  protein numeric,
  fat numeric,
  carbs numeric,
  salt numeric,
  phosphorus numeric default 0,
  phosphorus_absorption_rate numeric default 0.5,
  multiplier numeric default 1,
  source text,
  description text,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.health_records (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  weight numeric,
  body_fat numeric,
  muscle_mass numeric,
  bone_mass numeric,
  metabolic_age integer,
  height numeric,
  bmi numeric,
  systolic_bp integer,
  diastolic_bp integer,
  pulse integer,
  created_at timestamptz default now()
);

-- Free-form note for a single day ("その日の気づき・メモ").
-- One row per date; the unique constraint on `date` backs the client upsert
-- (onConflict: 'date') and already provides the lookup index.
create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- マイ定番食品, shared between devices (previously kept in each browser's
-- localStorage). Like the tables above it has no user column: this app is
-- single-user and every table is accessed with the anon key.
create table if not exists public.favorite_foods (
  id uuid primary key default gen_random_uuid(),
  -- Id the favorite had in the code presets or in localStorage. The unique
  -- constraint makes the one-time migration from each device idempotent
  -- (insert ... on conflict (legacy_id) do nothing); null for new favorites.
  legacy_id text unique,
  name text not null,
  amount_text text,
  calories numeric not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  carbs numeric not null default 0,
  salt numeric not null default 0,           -- 食塩相当量 (g)
  phosphorus numeric not null default 0,     -- mg
  phosphorus_absorption_rate numeric not null default 0.5,
  -- Per-base values when registered from a nutrition label, e.g.
  -- {"amountText":"100gあたり","amount":100,"unit":"g","weight":null,
  --  "calories":56,"protein":4.9,"fat":3,"carbs":2,"salt":0.02,"phosphorus":90}.
  -- Kept so other amounts can be recorded from it later.
  label_base jsonb,
  sort_order integer not null default 0,
  -- Soft delete: a deleted preset keeps its row, so another device's first
  -- migration cannot bring it back.
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_favorite_foods_sort on public.favorite_foods(sort_order, created_at);

alter table public.health_records
  add column if not exists body_fat numeric;

alter table public.health_records
  add column if not exists muscle_mass numeric;

alter table public.health_records
  add column if not exists bone_mass numeric;

alter table public.health_records
  add column if not exists metabolic_age integer;

alter table public.health_records
  add column if not exists height numeric;

alter table public.health_records
  add column if not exists bmi numeric;

alter table public.nutrition_records
  add column if not exists multiplier numeric default 1;

alter table public.nutrition_records
  add column if not exists phosphorus numeric default 0;

alter table public.nutrition_records
  add column if not exists phosphorus_absorption_rate numeric default 0.5;

-- Migration for existing projects where multiplier column may be missing or null.
alter table public.nutrition_records
  alter column multiplier set default 1;

alter table public.nutrition_records
  alter column phosphorus set default 0;

alter table public.nutrition_records
  alter column phosphorus_absorption_rate set default 0.5;

update public.nutrition_records
set multiplier = 1
where multiplier is null;

update public.nutrition_records
set phosphorus = 0
where phosphorus is null;

update public.nutrition_records
set phosphorus_absorption_rate = 0.5
where phosphorus_absorption_rate is null;

create index if not exists idx_nutrition_records_created_at on public.nutrition_records(created_at desc);
create index if not exists idx_health_records_date on public.health_records(date desc);
