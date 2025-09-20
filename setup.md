# Setup (Agent)

Prerequisites
- Node 20+ and npm
- Wrangler CLI v4.35+ (npm i -g wrangler)
- Cloudflare account (wrangler login)

Resources to create
- D1: DB (chat-db)
- KV: SESSIONS
- R2: AGENT_BUCKET (and optional preview bucket)
- Durable Objects: MyAgent, MCPAgent, PromptAgentDurableObject (auto on deploy)
- AI binding: AI (Workers AI)
- Browser Rendering: BROWSER
- Vectorize index: VECTORIZE_INDEX
- Stripe secrets: STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET; set STRIPE_PRICE_ID var

Commands (create + bind)
- D1 database
  - npx wrangler d1 create chat-db
  - Update wrangler.jsonc: set d1_databases.database_id to the returned id
  - npx wrangler d1 execute chat-db --file=src/schema.sql
- KV namespace
  - npx wrangler kv namespace create SESSIONS
  - Update wrangler.jsonc: set kv_namespaces[0].id to returned id
- R2 bucket
  - npx wrangler r2 bucket create agent-bucket
  - (optional) create preview bucket: npx wrangler r2 bucket create agent-bucket-preview
- Vectorize index (choose dims/metric to match your embeddings)
  - npx wrangler vectorize create agent-vectorize-index --dimensions 1024 --metric cosine
  - Ensure wrangler.jsonc vectorize.index_name matches
- AI + Browser bindings (no extra CLI needed)
- Stripe secrets
  - npx wrangler secret put STRIPE_API_KEY
  - npx wrangler secret put STRIPE_WEBHOOK_SECRET
- Optional env vars (set in wrangler.jsonc [vars])
  - STRIPE_PRICE_ID, AI_GATEWAY_NAME, AI_GATEWAY_ENDPOINT, AI_ACCOUNT_ID, DEFAULT_MODEL_ID, DEFAULT_SYSTEM_PROMPT
  - Account ID via: npx wrangler whoami

Run
- Dev: npx wrangler dev
- Deploy: npx wrangler deploy

Stripe webhook (dev)
- Forward webhook to your Worker URL (e.g., using cloudflared tunnel or a proxy)
- Endpoint path: /api/stripe-webhook
