alter table public.sources enable row level security;
alter table public.chunks enable row level security;
alter table public.entities enable row level security;
alter table public.facts enable row level security;
alter table public.retrieval_logs enable row level security;

revoke all on table public.sources from anon, authenticated;
revoke all on table public.chunks from anon, authenticated;
revoke all on table public.entities from anon, authenticated;
revoke all on table public.facts from anon, authenticated;
revoke all on table public.retrieval_logs from anon, authenticated;

grant all on table public.sources to service_role;
grant all on table public.chunks to service_role;
grant all on table public.entities to service_role;
grant all on table public.facts to service_role;
grant all on table public.retrieval_logs to service_role;

revoke all on function public.match_chunks(vector, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_chunks(vector, integer, double precision)
  to service_role;

alter table public.retrieval_logs
  alter column user_query drop not null;
alter table public.retrieval_logs
  add column if not exists query_fingerprint text;
alter table public.retrieval_logs
  add column if not exists expires_at timestamp with time zone
    not null default (now() + interval '30 days');

update public.retrieval_logs
set expires_at = created_at + interval '30 days'
where expires_at is null;

create index if not exists retrieval_logs_expires_at_idx
  on public.retrieval_logs (expires_at);

create table if not exists public.chat_rate_limits (
  client_key text not null,
  window_start timestamp with time zone not null,
  request_count integer not null default 1,
  created_at timestamp with time zone not null default now(),
  primary key (client_key, window_start)
);

alter table public.chat_rate_limits enable row level security;
revoke all on table public.chat_rate_limits from anon, authenticated;
grant all on table public.chat_rate_limits to service_role;

create index if not exists chat_rate_limits_window_start_idx
  on public.chat_rate_limits (window_start);

create or replace function public.check_chat_rate_limit(
  p_client_key text,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp with time zone := clock_timestamp();
  v_window_start timestamp with time zone;
  v_count integer;
begin
  if p_client_key is null or length(p_client_key) < 16 then
    raise exception 'Invalid client key';
  end if;
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.chat_rate_limits (client_key, window_start, request_count)
  values (p_client_key, v_window_start, 1)
  on conflict (client_key, window_start)
  do update set request_count = public.chat_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.chat_rate_limits
  where window_start < v_now - interval '2 days';

  return query
  select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    greatest(
      1,
      ceil(
        extract(
          epoch from (
            v_window_start + make_interval(secs => p_window_seconds) - v_now
          )
        )
      )::integer
    );
end;
$$;

revoke all on function public.check_chat_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_chat_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.cleanup_expired_security_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.retrieval_logs where expires_at < now();
  delete from public.chat_rate_limits where window_start < now() - interval '2 days';
end;
$$;

revoke all on function public.cleanup_expired_security_data()
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_security_data()
  to service_role;
