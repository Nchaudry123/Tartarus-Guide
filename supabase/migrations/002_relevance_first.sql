create or replace function match_chunks(
  query_embedding vector(384),
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
  order by c.embedding <=> query_embedding, s.credibility_rank asc
  limit match_count;
$$;
