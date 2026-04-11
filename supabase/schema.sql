-- supabase/schema.sql
-- Run this in your Supabase SQL editor to create the interviews table

create table if not exists interviews (
  id            uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  subject       text not null,
  age_group     text not null,
  verdict       text not null check (verdict in ('pass', 'review', 'fail')),
  overall_score numeric(3,1) not null,
  assessment    jsonb not null,   -- full AssessmentResult object
  transcript    jsonb not null,   -- ConversationTurn[]
  created_at    timestamptz default now()
);

-- Index for listing recent interviews
create index if not exists interviews_created_at_idx on interviews(created_at desc);

-- Optional: enable row-level security (recommended for production)
alter table interviews enable row level security;

-- Allow service role full access (used in /api/evaluate)
create policy "Service role full access" on interviews
  for all using (true);
