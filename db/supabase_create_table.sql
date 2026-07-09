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
