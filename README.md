# Maro's LAB — Delivery Starter Template

A minimal, opinionated project skeleton for every client engagement. Fork this repo to start a new project in under 30 minutes.

**Stack (per [ADR — Maro's LAB Default Delivery Stack](https://github.com/MarwanElZaher/maros-lab-starter)):**

| Layer | Choice |
|---|---|
| Web framework | Next.js 15 (App Router) |
| Hosting | Vercel |
| Auth | NextAuth.js + Prisma adapter |
| Database | PostgreSQL + Prisma ORM |
| AI / LLM | Anthropic Claude (prompt caching on by default) |
| CI/CD | GitHub Actions |
| Containers | Docker (for AWS ECS deployments) |
| Error tracking | Sentry |
| Logs | Axiom |
| Testing | Jest + Testing Library (unit) · Playwright (e2e) |

---

## Prerequisites

- Node 22+
- Docker (for local Postgres)
- A GitHub repo
- Accounts: Vercel, Supabase (or any Postgres), Anthropic, Sentry, Axiom

---

## Spin up a new engagement (< 30 minutes)

### 1. Fork / clone this template

```bash
gh repo create my-engagement --template MarwanElZaher/maros-lab-starter --private --clone
cd my-engagement
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local and fill in every value (see comments in the file)
```

Key values to set immediately:
- `DATABASE_URL` — local Postgres or Supabase connection string
- `NEXTAUTH_SECRET` — run `openssl rand -base64 32`
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `SENTRY_DSN` — from your Sentry project settings
- `NEXT_PUBLIC_AXIOM_DATASET` + `AXIOM_TOKEN` — from axiom.co

### 4. Start the local database

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 5. Run database migrations

```bash
npm run db:migrate   # creates tables and generates Prisma client
npm run db:seed      # optional: seed dev data
```

### 6. Start the dev server

```bash
npm run dev
# → http://localhost:3000
# → http://localhost:3000/api/health (should return { status: "ok" })
```

---

## Project structure

```
.
├── .github/workflows/     CI (ci.yml) and deploy (deploy.yml)
├── docker/                docker-compose for local Postgres
├── prisma/
│   ├── schema.prisma      Database schema (PostgreSQL + Prisma)
│   └── seed.ts            Dev seed script
├── src/
│   ├── app/               Next.js App Router pages and API routes
│   │   └── api/health/    Health check endpoint
│   ├── lib/
│   │   ├── db.ts          Prisma singleton
│   │   ├── ai.ts          Anthropic client + prompt-caching helper
│   │   └── logger.ts      Axiom structured logger
│   └── types/             Shared TypeScript types
├── tests/
│   ├── unit/              Jest + Testing Library tests
│   └── e2e/               Playwright end-to-end tests
├── sentry.*.config.ts     Sentry init (client / server / edge)
├── .env.example           All required env vars documented
├── Dockerfile             Multi-stage production image (for AWS ECS)
└── next.config.ts         Next.js + Sentry config
```

---

## Common tasks

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Type check | `npm run type-check` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| E2E tests | `npm run test:e2e` |
| New migration | `npm run db:migrate` |
| Open Prisma Studio | `npm run db:studio` |
| Build Docker image | `docker build -t engagement .` |

---

## Adding AI features

Use the pre-configured Anthropic client in `src/lib/ai.ts`. **Prompt caching is on by default** via `cachedSystem()` — always use it for long system prompts:

```ts
import { anthropic, DEFAULT_MODEL, cachedSystem } from "@/lib/ai";

const response = await anthropic.messages.create({
  model: DEFAULT_MODEL,
  max_tokens: 1024,
  system: cachedSystem("Your long system prompt here...") as any,
  messages: [{ role: "user", content: "Hello" }],
});
```

---

## Deploying

### Vercel (frontend + API routes)

1. Run `vercel link` locally once to generate `.vercel/project.json`
2. Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` to GitHub Secrets
3. Push to `main` — the deploy workflow runs automatically

### AWS ECS (containerized backend)

1. Build: `docker build -t engagement .`
2. Push to ECR, then deploy via your Terraform/CDK pipeline

---

## Environment variables reference

See [`.env.example`](.env.example) for the full list with descriptions.

> **Never commit `.env.local`** — it is in `.gitignore`. Production secrets live in Vercel's environment settings (or AWS SSM for container deployments).

---

## Customising for an engagement

1. Update `package.json` → `name` and `metadata` in `src/app/layout.tsx`
2. Replace `src/app/page.tsx` with the engagement's home page
3. Add domain models to `prisma/schema.prisma` and run `npm run db:migrate`
4. Add OAuth providers (GitHub, Google, etc.) to `src/app/api/auth/[...nextauth]/route.ts`
5. Extend `src/lib/ai.ts` with engagement-specific system prompts

---

## Tech decisions

All stack choices and their rationale are recorded in the [Maro's LAB Default Delivery Stack ADR](/MAR/issues/MAR-2#document-delivery-stack).
