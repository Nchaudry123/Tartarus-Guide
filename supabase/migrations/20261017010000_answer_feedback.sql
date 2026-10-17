-- Player feedback on chat answers (thumbs up/down), used to find failing answers and turn them
-- into eval cases. Server-side only: RLS on, no anon/authenticated access, service role writes.
-- Idempotent: safe to re-run. Rows expire after 90 days via cleanup_expired_security_data().

create table if not exists public.answer_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '90 days'),
  rating smallint not null check (rating in (-1, 1)),
  question text not null check (char_length(question) <= 2000),
  answer text not null check (char_length(answer) <= 8000),
  intent text check (char_length(intent) <= 80),
  history jsonb not null default '[]'::jsonb,
  player_profile jsonb not null default '{}'::jsonb,
  note text check (char_length(note) <= 500),
  client_fingerprint text check (char_length(client_fingerprint) <= 128)
);

alter table public.answer_feedback enable row level security;
revoke all on table public.answer_feedback from anon, authenticated;
grant all on table public.answer_feedback to service_role;

create index if not exists answer_feedback_created_at_idx
  on public.answer_feedback (created_at desc);
create index if not exists answer_feedback_expires_at_idx
  on public.answer_feedback (expires_at);

-- Same function as 003_security_hardening.sql, plus expired feedback.
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
end;
$$;

revoke all on function public.cleanup_expired_security_data()
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_security_data()
  to service_role;
