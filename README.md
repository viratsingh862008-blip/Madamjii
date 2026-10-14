# I'm Here

A private, two-person care companion for shared routines, caring reminders, and daily check-ins.

## Milestone 1

This branch contains the responsive React dashboard shell, Supabase magic-link authentication, private care-space creation, consent-based invitation acceptance, foundational PostgreSQL schema/RLS, and unit tests.

The dashboard explicitly labels illustrative content as preview data. Live schedule editing, check-in/journal persistence, browser push, message dispatch, n8n automation, retention scheduling, and production deployment are not implemented or verified yet.

## Stack

- React + Vite + TypeScript
- Tailwind CSS v4
- Supabase Auth + PostgreSQL/RLS
- Vitest
- Vercel-ready frontend
- Hosted n8n planned for later milestones

## Local setup

1. Install Node.js 22.12 or newer (the repository pins 22.20.0 in `.nvmrc`).
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Add your Supabase project URL and publishable key (or legacy anon key).
5. Apply `supabase/migrations/202610150001_initial_schema.sql` to a development Supabase project.
6. In Supabase Auth, enable email OTP/magic links and allow your local/deployed redirect URLs.
7. Run `npm run dev`.

Without Supabase environment variables, the site runs in **preview mode** using local illustrative data. Preview actions do not persist and are not real reminders.

## Verification commands

- `npm run typecheck`
- `npm run test:run`
- `npm run build`

GitHub Actions runs these checks on the feature branch. The workflow result must be inspected before the code is described as verified.

## Security

- Never put Supabase service-role keys or Web Push private keys in frontend environment variables.
- Only a Supabase publishable key (or legacy anon key) belongs in the browser.
- The migration uses RLS, restricted RPC execution grants, hashed single-use invitation tokens, explicit invitation consent, and a private helper schema.
- Review and test the migration in a non-production Supabase project before storing personal or health-related information.
- See `docs/PRD.md` for finalized product decisions and current scope.
