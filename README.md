# Are You OK?

A private, two-person care companion for shared routines, caring reminders, and daily check-ins.

## Milestone 1

This branch contains the responsive React dashboard shell, Supabase username/password signup and authentication (using internal Auth aliases; no email address is collected), RLS-protected persistent profiles, private care-space creation, consent-based invitation acceptance, foundational PostgreSQL schema/RLS, and unit tests.

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
5. The initial schema is applied to the configured development project. For reproducibility, the applied migration is `supabase/migrations/20261014191941_initial_schema.sql`; the follow-up hardening migration is `supabase/migrations/20261014192015_revoke_public_rls_auto_enable_execute.sql`.
6. In Supabase Auth, disable **Confirm email** to allow username/password signup without email verification. The app maps usernames to internal Supabase Auth email aliases; users do not enter a real email address. This also means email-based password recovery is not available until a separate recovery method is implemented. Keep password strength and rate limits enabled.
7. Run `npm run dev`.

Without Supabase environment variables, the site runs in **preview mode** using local illustrative data. Preview actions do not persist and are not real reminders.

## Verification commands

- `npm run typecheck`
- `npm run test:run`
- `npm run build`

GitHub Actions runs these checks on the feature branch. The workflow result must be inspected before the code is described as verified.

## Signup data for development testing

- Supabase **Authentication → Users** records each account's Auth UUID, internal auth alias, creation time, and last sign-in metadata where available.
- The `public.profiles` table stores the normalized username, display name, and timestamps. The signup trigger creates the profile automatically; the username is not editable by ordinary client updates.
- To inspect test accounts, use the Supabase Dashboard's Authentication user list and Table Editor for `public.profiles`. The profile table uses RLS so a signed-in user can only read their own row; inspect all test profiles from the trusted Supabase Dashboard, not by making the table public.
- **Passwords are never collected in a readable form or copied into a table/log.** Supabase Auth handles password storage. Do not log passwords, session tokens, or private care data for testing.
- Use synthetic test accounts and non-sensitive sample data while end-to-end authorization and consent tests are still in progress.

## Security

- Never put Supabase service-role keys or Web Push private keys in frontend environment variables.
- Only a Supabase publishable key (or legacy anon key) belongs in the browser.
- The migrations use RLS, a database-owned profile creation trigger linked to each Auth UUID, own-profile-only read/update policies, restricted RPC execution grants, hashed single-use invitation tokens, explicit invitation consent, and a private helper schema.
- The schema has been applied to the configured Supabase project and verified to contain 18 public tables with RLS enabled. Automated advisors still flag intentional `SECURITY DEFINER` RPCs callable by authenticated users and five server-only tables with no client policies; do not store personal or health-related data until end-to-end authorization tests and consent/revocation flows are completed.
- See `docs/PRD.md` for finalized product decisions and current scope.
