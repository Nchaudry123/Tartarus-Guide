-- One row per chat turn: how it was routed (mode, agent tools, safety net, fallback), how it
-- ended (answer, clarifying question, missing evidence, error) and how long it took. Used to
-- find failure patterns and slow turns in real traffic. No question or answer text is stored,
-- only a SHA-256 fingerprint of the normalized question so repeats can be grouped.
-- Server-side only: RLS on, no anon/authenticated access, service role writes.
-- Idempotent: safe to re-run. Rows expire after 30 days via cleanup_expired_security_data().

create table if not exists public.chat_turn_logs (
  id uuid primary key,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '30 days'),
  question_fingerprint text not null check (char_length(question_fingerprint) <= 64),
  chat_mode text not null check (char_length(chat_mode) <= 16),
  route text not null check (char_length(route) <= 32),
  outcome text not null check (char_length(outcome) <= 32),
  intent text check (char_length(intent) <= 80),
  agent_tools jsonb not null default '[]'::jsonb,
  safety_net boolean not null default false,
  agent_fallback boolean not null default false,
  cached boolean not null default false,
  confidence real,
  source_count smallint not null default 0,
  history_turns smallint not null default 0,
  total_ms integer not null default 0,
  llm_calls smallint not null default 0
);

alter table public.chat_turn_logs enable row level security;
revoke all on table public.chat_turn_logs from anon, authenticated;
grant all on table public.chat_turn_logs to service_role;

create index if not exists chat_turn_logs_created_at_idx
  on public.chat_turn_logs (created_at desc);
create index if not exists chat_turn_logs_expires_at_idx
  on public.chat_turn_logs (expires_at);

-- Links a thumbs up/down to the turn it rated. No foreign key: turn logs expire before feedback.
alter table public.answer_feedback
  add column if not exists turn_id uuid;
create index if not exists answer_feedback_turn_id_idx
  on public.answer_feedback (turn_id);

-- Same function as 20261017010000_answer_feedback.sql, plus expired turn logs.
create or replace function public.cleanup_expired_security_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.retrieval_logs where expires_at < now();
  delete from public.chat_rate_limits where window_start < now() - interval '2 days';
  delete from public.answer_feedback where expires_at < now();
  delete from public.chat_turn_logs where expires_at < now();
end;
$$;

revoke all on function public.cleanup_expired_security_data()
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_security_data()
  to service_role;
