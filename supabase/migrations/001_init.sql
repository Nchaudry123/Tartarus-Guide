create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text unique not null,
  domain text not null,
  category text not null,
  source_type text not null default 'guide',
  credibility_rank integer not null default 50,
  last_checked timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  section_title text,
  chunk_text text not null,
  chunk_hash text unique not null,
  token_count integer not null,
  embedding vector(1536),
  created_at timestamp with time zone not null default now()
);

create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  aliases text[] not null default '{}',
  normalized_name text not null,
  created_at timestamp with time zone not null default now(),
  constraint entities_type_check check (
    type in (
      'enemy',
      'boss',
      'persona',
      'social_link',
      'request',
      'item',
      'equipment',
      'location',
      'mechanic',
      'party_member',
      'tartarus_floor',
      'activity',
      'skill'
    )
  )
);

create unique index if not exists entities_normalized_type_idx
  on entities (normalized_name, type);

create table if not exists facts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  fact_type text not null,
  value text not null,
  confidence numeric not null default 0.5,
  notes text,
  created_at timestamp with time zone not null default now(),
  constraint facts_type_check check (
    fact_type in (
      'weakness',
      'resistance',
      'nullifies',
      'drains',
      'repels',
      'location',
      'strategy',
      'recommended_party',
      'fusion_recipe',
      'unlock_condition',
      'deadline',
      'reward',
      'prerequisite',
      'floor_range',
      'tip',
      'schedule',
      'answer_choice',
      'item_effect'
    )
  ),
  constraint facts_confidence_check check (confidence >= 0 and confidence <= 1)
);

create unique index if not exists facts_entity_source_type_value_idx
  on facts (entity_id, source_id, fact_type, md5(lower(value)));

create table if not exists retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  user_query text not null,
  matched_entities jsonb not null default '[]'::jsonb,
  matched_chunks jsonb not null default '[]'::jsonb,
  matched_facts jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists sources_domain_idx on sources (domain);
create index if not exists sources_category_idx on sources (category);
create index if not exists chunks_source_id_idx on chunks (source_id);
create index if not exists facts_entity_id_idx on facts (entity_id);
create index if not exists facts_source_id_idx on facts (source_id);
create index if not exists facts_type_idx on facts (fact_type);

create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function match_chunks(
  query_embedding vector(1536),
  match_count integer default 8,
  similarity_threshold float default 0.72
)
returns table (
  id uuid,
  source_id uuid,
  section_title text,
  chunk_text text,
  token_count integer,
  similarity float,
  source_title text,
  source_url text,
  source_domain text,
  source_credibility_rank integer
)
language sql stable
as $$
  select
    c.id,
    c.source_id,
    c.section_title,
    c.chunk_text,
    c.token_count,
    1 - (c.embedding <=> query_embedding) as similarity,
    s.title as source_title,
    s.url as source_url,
    s.domain as source_domain,
    s.credibility_rank as source_credibility_rank
  from chunks c
  join sources s on s.id = c.source_id
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  order by s.credibility_rank asc, c.embedding <=> query_embedding
  limit match_count;
$$;
