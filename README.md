# Are You OK?

A private, two-person care companion for shared routines, caring reminders, and daily check-ins.

## Milestone 1

This branch contains the responsive React dashboard shell, Supabase username/password signup and authentication (using internal Auth aliases; no email address is collected), RLS-protected persistent profiles, private care-space creation, consent-based invitation acceptance, foundational PostgreSQL schema/RLS, and unit tests.

The dashboard labels preview data explicitly. Persistent one-time schedules, personal schedule controls, shared schedule proposals and friend approval are now wired to Supabase. Background reminder delivery, recurring schedule generation, persistent check-ins/journal/messages, automated retention and production end-to-end verification remain incomplete.

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

## Schedule and admin workflow (implementation status)\n\n- The Admin controls workspace is visible to care-space admins and links to invitations, schedule management, notification setup and upcoming feature areas.\n- Schedule creation supports personal one-time routines across meal, hydration, medicine, rest, task and check-in categories. Instructions are optional; medicine instructions must follow the prescriber's directions.\n- Admins can propose shared one-time schedules. Shared plans remain `proposed` until the friend approves or declines them. Approval records an audit event.\n- Personal schedule rows can be paused, resumed and archived. Schedule writes are validated in a server-side PostgreSQL RPC and use the authenticated active membership.\n- Creating a personal schedule creates a task occurrence and idempotent queued reminder job. Approving a shared schedule queues its first reminder. **Queued does not mean delivered**: the background notification worker is not yet deployed. Recurrence, snooze, quiet-hour deferral and 30-minute follow-up are not active yet.\n\n## Free notifications (implementation status)

- Persistent in-app notification centre uses `public.app_notifications`; row-level security restricts records to their owner and records expire after 90 days.
- Browser service worker is in `public/sw.js`; it handles incoming Web Push payloads and notification clicks.
- Per-user browser subscriptions are stored in `public.browser_push_subscriptions` with owner-only RLS.
- In-app polling runs while a signed-in app tab is open and can surface newly created notifications through the browser Notification API when permission is granted.
- Set `VITE_VAPID_PUBLIC_KEY` in Vercel to allow Web Push subscription. The corresponding private VAPID key must only be configured as a server-side secret. Background push sending and scheduled reminder dispatch are not active until a server-side sender and scheduled worker are configured and tested.
- No paid SMS/WhatsApp provider or n8n instance is required for this initial architecture. Free platform quotas and delivery limitations still apply.
- Apply migrations `supabase/migrations/20261015150000_free_notifications_foundation.sql`, `supabase/migrations/20261015160000_persistent_schedule_creation_and_review.sql`, and `supabase/migrations/20261015161500_shared_schedule_approval_queues_reminder.sql` before testing. These migrations have been applied to the configured dev Supabase project; production must be migrated separately before release.


## Product milestone: six workflows

Implemented in this branch:
1. **Reminder engine foundation:** Supabase Edge Function `reminder-worker` claims queued jobs safely, applies quiet-hours deferral, creates private in-app notifications, attempts Web Push when VAPID secrets exist, retries temporary failures, disables expired subscriptions, and creates one 30-minute follow-up per pending occurrence.
2. **Recurring schedules:** schedule form supports one-time, daily and weekly patterns; the worker generates the next occurrence after the current one is due. Completion cancels outstanding jobs. Snooze creates a five-minute reminder and is limited to three snoozes per occurrence.
3. **Messages:** persisted sender/recipient conversation history and immediate sending in the care space. Scheduled message sending is not yet enabled.
4. **Daily check-ins:** mood, energy and private note persistence; optional summary fields are copied separately for consent-aware sharing.
5. **Private journal and progress:** create/edit/delete journal entries; personal check-in trend counts, average energy and recent mood.
6. **Privacy/retention hardening:** RLS on new tables, server-side RPC validation, worker-only queue claim/finish/retention RPCs, bounded retries, idempotency keys, and 90-day cleanup logic.

### Activate scheduled delivery (required before real reminders)

The Edge Function is deployed to the development Supabase project, but **automatic invocation and real Web Push are not active until these project secrets and a scheduler are configured**. Do not put the service-role key or VAPID private key in Vite variables or GitHub.

Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets):
- `VAPID_PUBLIC_KEY`: Web Push public key
- `VAPID_PRIVATE_KEY`: Web Push private key
- `VAPID_SUBJECT`: a contact URI such as `mailto:admin@your-owned-domain.example`

Vercel project environment:
- `VITE_VAPID_PUBLIC_KEY`: the matching **public** VAPID key only; redeploy after adding it.

Then configure a trusted Supabase Cron job to POST to `https://mjuoroaynwczndrluarq.supabase.co/functions/v1/reminder-worker` every minute with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` and `Content-Type: application/json`. Store the service-role key in Supabase Vault/Cron secrets; never put it in browser code, a public repository, or a client-visible environment variable. The worker rejects requests without this server credential. Check the function logs and verify a test job from two separate accounts before relying on delivery. Supabase/Vercel free-tier limits and browser/OS notification settings still apply.

### Safety and current limitations

- A READY deployment is not a substitute for integration testing. Test signup, invitation acceptance, friend approval, two-account messaging, task completion/snooze, quiet-hours deferral, retries, and retention in a non-production care space first.
- Web Push is best-effort, not guaranteed. In-app notifications are the fallback when the app is opened; if VAPID or the scheduler is missing, the app cannot promise a background alert.
- Medicine schedules store user-provided instructions only. The app is not a medical service or emergency monitor.
- Review the security advisor and RLS policies before production; never store real sensitive notes until account deletion/recovery and consent-revocation flows have been end-to-end tested.
