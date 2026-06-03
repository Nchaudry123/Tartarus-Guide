# Tartarus Guide RAG

Backend foundation and frontend prototype for a Persona 3 Reload guide chatbot. The project includes a source-backed RAG database pipeline, a terminal Q&A flow, a Next.js chat app, and a static preview you can open immediately.

The system is designed to store source metadata, small retrieval chunks, structured facts, and links back to original guide pages. It should not clone, republish, or serve full IGN articles.

## Stack

- TypeScript and Node.js
- Supabase Postgres
- pgvector
- OpenAI-compatible embeddings API
- OpenAI-compatible chat API
- Cheerio for readable content extraction
- robots.txt checks, rate limiting, and local raw HTML cache
- Zod validation for fact extraction output

## Setup

Install dependencies:

```bash
npm install
```

## View the Website

Fast static preview:

```bash
python3 -m http.server 4173
```

Open:

```text
http://127.0.0.1:4173/
```

This preview uses [index.html](</Users/namir/Documents/New project/index.html>), [styles.css](</Users/namir/Documents/New project/styles.css>), and [script.js](</Users/namir/Documents/New project/script.js>). It has the Persona-inspired chatbot UI and mock answers, so you can view and test the interface without credentials.

If the static site is hosted separately from the API, set the API URL before [script.js](</Users/namir/Documents/New project/script.js>) runs:

```html
<script>
  window.TARTARUS_API_URL = "https://your-vercel-app.vercel.app/api/chat";
</script>
```

Without that value, the static preview calls `/api/chat` and falls back to mock answers when no API exists.

Next.js app:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000/
```

The Next app lives in [app/page.tsx](</Users/namir/Documents/New project/app/page.tsx>) and [components/ChatShell.tsx](</Users/namir/Documents/New project/components/ChatShell.tsx>). The API route is [app/api/chat/route.ts](</Users/namir/Documents/New project/app/api/chat/route.ts>).

Create an environment file:

```bash
cp .env.example .env
```

Fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMBEDDING_API_KEY`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `CHAT_API_KEY`
- `CHAT_BASE_URL`
- `CHAT_MODEL`
- `INGEST_USER_AGENT`
- `INGEST_DELAY_MS`
- `RAW_CACHE_DIR`
- `RAG_CHAT_ENDPOINT` optional, for a deployed RAG chat API that accepts `POST { question, conversationId }`
- `USE_MOCK_CHAT=true` optional, to force mock responses in the Next API route

Use a real contact in `INGEST_USER_AGENT` if this will run outside local development.

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run [supabase/migrations/001_init.sql](</Users/namir/Documents/New project/supabase/migrations/001_init.sql>).
4. Confirm the `vector` extension is enabled.
5. Keep the service role key server-side only. Do not expose it in a browser app.

The migration creates:

- `sources`
- `chunks`
- `entities`
- `facts`
- `retrieval_logs`
- `match_chunks(...)` vector search RPC

`sources.credibility_rank` is used to prefer IGN when multiple sources conflict. Lower rank means more trusted.

## Ingestion

Curated source URLs live in [src/ingest/urls.ts](</Users/namir/Documents/New project/src/ingest/urls.ts>).

Run ingestion:

```bash
npm run ingest
```

Refresh cached HTML:

```bash
npm run ingest -- --force
```

Skip LLM fact extraction and only embed chunks:

```bash
npm run ingest -- --skip-facts
```

The pipeline:

1. Starts from curated Persona 3 Reload guide URLs.
2. Checks `robots.txt`.
3. Fetches slowly using `INGEST_DELAY_MS`.
4. Caches raw HTML in `.cache/raw-pages`.
5. Removes navigation, ads, comments, scripts, styles, and boilerplate.
6. Preserves title, URL, headings, and section titles.
7. Splits readable guide text into roughly 300-700 token chunks.
8. Embeds chunks and inserts them into Supabase.
9. Runs an LLM extraction pass for source-supported facts.
10. Deduplicates entities and facts before writing.

## Legal-Safer Storage

This project stores small retrieval chunks and structured facts with links back to source pages. Do not build endpoints that return full cached pages or reconstruct complete articles from stored chunks.

For development, raw HTML is cached locally only under `.cache/raw-pages`, which is gitignored.

## Duplicate Prevention

Chunks use a SHA-256 `chunk_hash` from source URL, section title, and chunk text. The database enforces uniqueness.

Entities are deduplicated by `(normalized_name, type)`.

Facts are checked before insert by entity, source, fact type, and case-insensitive value. The migration also adds a unique expression index over the same practical identity.

## Retrieval

Ask a question from the terminal:

```bash
npm run ask -- "What is Dancing Hand weak to?"
```

The retrieval flow:

1. Normalizes the query.
2. Detects likely fact intent.
3. Searches structured facts first.
4. Searches vector chunks second.
5. Builds a compact context package.
6. Generates an answer using only retrieved context.
7. Includes source URLs.
8. Says when information is missing.

Answers are intended to sound like a veteran Persona 3 Reload player: direct, practical, strategy-first, and light on filler.

## Frontend API Contract

The Next frontend calls:

```http
POST /api/chat
```

Request:

```json
{
  "question": "What is Dancing Hand weak to?",
  "conversationId": "optional-id"
}
```

Response:

```json
{
  "answer": "string",
  "sections": [{ "title": "string", "content": "string" }],
  "tables": [{ "title": "string", "columns": ["string"], "rows": [["string"]] }],
  "sources": [{ "title": "string", "url": "string", "domain": "string" }],
  "confidence": 0.8,
  "missingInfo": "string"
}
```

The Vercel/Next route in [app/api/chat/route.ts](</Users/namir/Documents/New project/app/api/chat/route.ts>) can run RAG directly when these environment variables are present:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMBEDDING_API_KEY`
- `CHAT_API_KEY`

It retrieves structured facts and vector chunks from Supabase, asks an OpenAI-compatible chat API for a JSON response, and returns the card format above. If credentials are missing, retrieval fails, or `USE_MOCK_CHAT=true`, it falls back to mock Persona-style responses.

For Groq chat generation, set:

```bash
CHAT_BASE_URL=https://api.groq.com/openai/v1
CHAT_MODEL=llama-3.1-8b-instant
CHAT_API_KEY=your-groq-api-key
```

Embeddings still need an embeddings provider such as OpenAI:

```bash
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

If you deploy RAG as a separate service later, set `RAG_CHAT_ENDPOINT`; the route will call that first before trying direct Supabase retrieval.

To change mock responses, edit the `mockResponse` function in [app/api/chat/route.ts](</Users/namir/Documents/New project/app/api/chat/route.ts>) for the Next app, or `mockAnswer` in [script.js](</Users/namir/Documents/New project/script.js>) for the static preview.

## Adding Sources

Add entries to [src/ingest/urls.ts](</Users/namir/Documents/New project/src/ingest/urls.ts>).

Use lower `credibilityRank` values for sources you want to win conflicts. IGN is currently ranked `10`; less-preferred sources should use higher numbers such as `30`, `50`, or `80`.

Keep each source page focused. Broad index pages are useful for discovery, but enemy, boss, request, Social Link, and fusion-specific pages usually produce better facts.

## Retrieval Quality Checks

After ingestion, test high-risk questions:

```bash
npm run ask -- "What is Dancing Hand weak to?"
npm run ask -- "How do I beat Priestess?"
npm run ask -- "What reward do I get for Elizabeth request 12?"
npm run ask -- "How do I fuse Oberon?"
```

Good answers should:

- Prefer structured facts when available.
- Include source URLs.
- Avoid unsupported exact weaknesses, deadlines, fusions, and boss advice.
- Clearly say when the database does not have enough information.

## Typecheck

```bash
npm run typecheck
```

## Deploy on Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add environment variables in Vercel Project Settings.
4. Run the Supabase migration and ingest sources before expecting source-backed answers.
5. Deploy with the default Next.js settings.

Minimum Vercel environment variables for live direct RAG:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
CHAT_API_KEY=...
CHAT_BASE_URL=https://api.groq.com/openai/v1
CHAT_MODEL=llama-3.1-8b-instant
USE_MOCK_CHAT=false
ALLOWED_ORIGINS=https://nchaudry123.github.io
```

`ALLOWED_ORIGINS` is optional. Use it when GitHub Pages or another frontend calls the Vercel API route from a different origin. If omitted, the route allows all origins.
