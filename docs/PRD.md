# Are You OK? — Milestone 1 Product Requirements

## Product promise
A private two-person care companion for routines, caring messages and daily check-ins. Care without control: the friend retains control over personal routines, consent, quiet hours and shared information.

## Finalized decisions
- Invitation: manually shared private link, hashed single-use token, 7-day expiry.
- Roles: one admin and one friend per care space.
- Timezone: friend's configured IANA timezone; default to browser timezone during initial setup.
- Default snooze: 5 minutes.
- Quiet hours: 23:00–07:00 in the friend's timezone.
- Missed-task follow-up: one gentle follow-up 30 minutes after the original reminder, only after successful initial dispatch and only while the task remains pending.
- Message history: sender and intended recipient can read messages addressed to them, with both parties consenting to message history.
- Check-in sharing: daily summary is opt-in; free-text notes and journal entries remain private.
- Retention: eligible history retained for 90 days, with a documented backup expiry policy.
- Automation: hosted n8n in a later milestone.
- Medicine: friend confirms prescribed instructions; admin may propose changes; no dosage advice or automatic changes.
- Visual system: warm sage green, cream and neutral colors.
- Frontend: React, Vite, TypeScript, Tailwind CSS.
- Backend: Supabase Auth/Postgres/RLS; frontend hosting target Vercel.
- Push: browser Web Push only, to be implemented after the foundation.

## Milestone 1 scope
- Responsive care dashboard design and role preview.
- Public email/password signup with a required display name; Supabase generates the immutable user UUID. Email confirmation is disabled for frictionless registration, while authenticated sessions and RLS remain mandatory.
- Email/password sign-in and sign-out.
- Create a private care space with owner membership created by a database trigger.
- Create and accept a private single-use invitation through restricted RPC functions and explicit consent screen.
- Foundational PostgreSQL schema and RLS.
- Unit tests for role helpers, summary privacy, quiet hours and follow-up eligibility.
- CI for typecheck, unit tests and production build.

## Not yet implemented
Live schedule editing, reminder queue workers, browser push subscription registration, message delivery, check-in/journal persistence, reports, hosted n8n workflows, retention scheduler and production deployment. The UI labels these as future milestone functionality and does not claim they are active.

## Privacy and safety
- Journal entries and check-in free-text notes are private.
- Only approved daily summary fields may be shared; daily summary sharing defaults to off.
- Message history requires consent from both members.
- Push dispatch does not prove a notification was displayed or read.
- No missed-task event is treated as a medical emergency.
- Never generate dosage advice or alter a prescription.
- No service-role key or Web Push private key in frontend code.
- RLS and server-side checks enforce access boundaries.

## Acceptance gates
1. Invitation token expires, is single-use, and cannot be accepted by its creator.
2. Only an active admin can create an invitation.
3. A care space cannot have more than one active friend.
4. Membership and schedule access are isolated by RLS.
5. Journal and private notes are inaccessible to the other member.
6. The shared check-in summary contains no free-text note and requires explicit opt-in.
7. Invitation acceptance requires explicit consent to shared schedules and message history.
8. Browser preview data is clearly labeled and never persisted.
9. New users can register without email confirmation, and Supabase assigns each account a unique UUID.
10. Users cannot read or mutate another user's private records.
9. Typecheck, unit tests and production build pass in CI before merge.
