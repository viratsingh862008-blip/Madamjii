# I'm Here

A private, two-person care companion for shared routines, caring reminders, and daily check-ins.

## Project status

Milestone 1 is being built on a feature branch. See the product requirements in `docs/PRD.md` once the implementation branch is available.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase Auth and PostgreSQL with Row Level Security
- Vitest for unit tests
- Vercel-ready frontend

## Security

Never expose Supabase service-role keys or Web Push private keys in the browser. The client may use only the Supabase publishable/anon key. Database access must be protected by RLS policies.
