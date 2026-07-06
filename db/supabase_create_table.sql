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
  multiplier numeric default 1,
  source text,
  description text,
  image_url text,
  created_at timestamptz default now()
);

alter table public.nutrition_records
  add column if not exists multiplier numeric default 1;

create index if not exists idx_nutrition_records_created_at on public.nutrition_records(created_at desc);
