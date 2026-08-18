# CoachOS

A coaching command center: sessions, players, attendance and payments, built as
an installable mobile-first web app.

The UI is a faithful implementation of the design prototype kept at
[`docs/CoachOS.dc.html`](docs/CoachOS.dc.html) — that file is the source of
truth for typography, colour, spacing, layout, copy and interaction states.

---

## Quick start

```bash
nvm use 20            # Node 20+ required (developed on 22)
npm install
npm run dev           # http://localhost:3000
```

With no Supabase credentials configured, CoachOS boots against an **in-memory
development store** seeded with demo data, so a fresh clone runs immediately.
That store lives in the Node process and resets on restart — it exists so the
app is clickable and testable, not for real use.

To run against a real database, follow **Database setup** below.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the offline test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:integration` | Run the live-database suite (skips unless configured — see `tests/integration/README.md`) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run schema` | Regenerate `supabase/schema.sql` from the migrations |
| `npm run icons` | Regenerate the PWA icon PNGs |

---

## Database setup

### 1. Create a Supabase project

<https://supabase.com/dashboard> → **New project**. Note the project URL and the
`anon` key from **Project Settings → API**.

### 2. Create the schema

Two equivalent options:

**Option A — SQL editor (simplest).** Open the Supabase **SQL Editor**, paste
the whole of [`supabase/schema.sql`](supabase/schema.sql), and run it. That file
is the concatenation of every migration, in order.

**Option B — Supabase CLI.**

```bash
npm i -g supabase
supabase link --project-ref <your-project-ref>
supabase db push        # applies supabase/migrations/*.sql in order
```

The migrations are:

| File | Contents |
| --- | --- |
| `0001_initial_schema.sql` | Tables, enums, constraints, indexes, `updated_at` triggers |
| `0002_financial_integrity.sql` | Triggers that make over-payment, over-crediting and cross-tenant financial writes impossible |
| `0003_rls_policies.sql` | Row-level security: every table scoped to the owning coach |
| `0004_new_coach_bootstrap.sql` | Creates a `coaches` row automatically when an auth user signs up |
| `0005_coach_timezone.sql` | Per-coach IANA timezone — every calendar decision is made in it |

> Upgrading an existing database? Apply `0005_coach_timezone.sql`. Rows default
> to `UTC`; each coach sets their real zone at onboarding or in Settings.

### 3. Configure auth

**Authentication → Providers → Email**: enable it. For local testing, turning
**Confirm email** off lets you sign in immediately after signing up.

**Authentication → URL Configuration**:
- **Site URL** — your dev or production origin.
- **Redirect URLs** — add `<origin>/auth/callback`. Both the signup
  confirmation and the password-reset links land there; without it those links
  will be rejected.

**Authentication → Rate Limits**: check the built-in limits are enabled. The
app adds a small in-process throttle on sign-in, signup and password reset, but
that only covers a single server instance — Supabase's limits are the real
protection. See `lib/security/rate-limit.ts`, which says so plainly.

### 4. Set environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000     # your real origin in production
```

`NEXT_PUBLIC_SITE_URL` is what confirmation and password-reset emails link
back to. Without it the app guesses from request headers, which works for
Vercel previews but is not reliable for emailed links.

`.env.local` is gitignored. The `service_role` key is deliberately **not** used
anywhere in this application — it bypasses row-level security, so it must never
be added to the app or to Vercel.

### 5. (Optional) Seed development data

Sign up in the app first so an auth user and its `coaches` row exist. Then open
[`supabase/seed.sql`](supabase/seed.sql), change `v_email` at the top to the
address you signed up with, and run the file in the SQL editor.

The seed deliberately exercises every UI state: upcoming and past sessions;
present / absent / unmarked / skipped attendance; paid, unpaid, overdue,
partially paid, fully credited and voided charges; a free session; a cancelled
session; and an archived player. Dates are relative to `current_date`, so the
demo never goes stale. **Do not run it against production.**

---

## Deployment (Vercel)

1. Push this branch to GitHub.
2. In Vercel, **Add New → Project**, import the repository.
3. Framework preset: **Next.js**. Build command `next build`, output directory
   left at its default — no overrides needed.
4. Add the environment variables under **Settings → Environment Variables**
   (Production, Preview and Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` — the deployed origin, e.g. `https://coachos.vercel.app`
5. Deploy.
6. Back in Supabase, set **Authentication → URL Configuration → Site URL** to
   the deployed origin and add `<origin>/auth/callback` to **Redirect URLs**.

> **A production deploy without Supabase credentials refuses to start.** Demo
> mode serves the same seeded coach to every visitor with no authentication, so
> the app fails loudly rather than silently exposing it. If you genuinely want a
> public demo build, set `COACHOS_ALLOW_DEMO_MODE=true` deliberately.

### Installing it as an app

CoachOS ships a web manifest, maskable icons and a service worker, so it
installs to a phone home screen: open the deployed URL in Safari or Chrome and
choose **Add to Home Screen**. The service worker is registered only in
production builds, caches static assets and an offline page, and deliberately
never caches pages or API responses containing a coach's data.

---

## Architecture

```
app/                      Next.js App Router — routes and screens
  (auth)/                 signed-out: login, signup
  (app)/                  signed-in with the bottom tab bar
  (focus)/                signed-in, full screen (new session, attendance, forms)
components/               presentational primitives + shell (tokens live here)
lib/
  domain/                 pure business logic — no I/O, fully unit tested
    money.ts              integer-cent parsing and formatting
    finance.ts            outstanding / status / revenue derivation
    sessions.ts           attendance states, conflicts, cadence
    dates.ts              calendar and time formatting
  services/               use cases: players, sessions, finance, settings, dashboard
  validation/             zod schemas — every mutation is validated server-side
  actions/                server actions: auth check → validate → service → revalidate
  security/               auth throttling
  observability/          structured logging (pluggable error reporter)
  data/                   the DataStore port and its two adapters
    mock/                 in-memory (development + tests)
    supabase/             Postgres via Supabase
supabase/migrations/      schema, integrity triggers, RLS policies
tests/                    offline vitest suites
tests/integration/        live-Supabase suite (RLS + adapter), env-gated
docs/CoachOS.dc.html      the design prototype (UI source of truth)
```

The dependency direction is strictly one way:

```
UI → server action → validation → service → data access → Postgres
```

No component imports a Supabase client, and no SQL or query builder appears
outside `lib/data/`. Swapping the persistence layer means writing one new
adapter against `lib/data/store.ts`.

### Money

Money is **integer cents everywhere**. No floating-point arithmetic is ever
performed on a monetary value, and no column stores money as a float.

There is no stored "balance" column, by design. Every figure the app shows is
derived from the underlying records through one function:

```
outstanding = charge.amount − payments − credits     (floored at 0)
voided charges contribute 0
revenue     = sum of payments actually recorded
```

Because the Dashboard, Players list, Player Detail, Payments ledger and Session
Detail all read that same derivation (`lib/services/finance.ts` →
`loadFinance()`), they cannot disagree about a balance. A test asserts this
directly.

Charge amounts are captured when the charge is created and are **historical**:
changing a player's default rate later never rewrites past charges. Repricing a
session asks first, and only ever touches *unpaid* charges.

### Attendance

Four explicit states — `unmarked`, `present`, `absent`, `skipped`. `skipped` is
**not** a synonym for `unmarked`: it records a deliberate decision, so the
session stops appearing in "needs attention" and is excluded from attendance
percentages. Marking is two dedicated buttons per player, never tap-to-cycle;
tapping the active choice again clears it back to `unmarked`.

### Time

Every calendar decision — "today", whether a session has ended, whether a
charge is overdue — is made in the **coach's own IANA timezone**, stored on
`coaches.timezone`. The server runs in UTC on Vercel, so reading the server's
local date would roll a Californian coach's dashboard over to tomorrow at 5pm,
mid-evening-sessions. The zone is detected from the browser at onboarding and
editable in Settings, which shows the current local time so a wrong pick is
obvious.

`coachClock()` in `lib/services/clock.ts` is the only sanctioned way to build
the clock; there is no server-local fallback left in the codebase.

The **attendance window** setting is wired to this too: a session is only
reported as missing attendance once the chosen grace period (same day / 24 /
48 / 72 hours) has elapsed since it ended.

### Authentication and authorization

Authentication is Supabase Auth (email + password). This application never sees,
hashes or stores a password. Sessions live in **httpOnly cookies** managed by
`@supabase/ssr` — never `localStorage` — and `middleware.ts` refreshes them on
each request and redirects signed-out traffic away from authenticated routes.

Full account lifecycle:

- **Signup** → confirmation email → `/auth/callback` exchanges the one-time
  code for a session → onboarding.
- **Forgot password** → `/forgot-password` → reset email → `/auth/callback` →
  `/reset-password`. The request endpoint always reports success whether or not
  the address has an account, so it cannot be used to enumerate users.
- `/auth/callback` only forwards to an allow-listed same-origin path, so a
  crafted link cannot turn it into an open redirect.

Authorization is enforced in the **database**, not the frontend:

- every coach-owned table has RLS enabled and forced;
- policies scope every row to `current_coach_id()`, derived from `auth.uid()`;
- triggers reject any write whose parent record belongs to a different coach;
- the `anon` role is granted nothing.

So a leaked or guessed row id from another tenant returns nothing, and a bug in
the application layer still cannot leak data. `tests/authorization.test.ts`
covers the application-layer half of this.

### Financial integrity

- `recordPayment` / `recordCredit` run inside a unit of work and re-derive the
  charge before writing.
- An optimistic `expectedOutstanding` guard rejects a stale submission, which is
  what makes a double-tapped **Mark Paid** safe.
- Independently, database triggers reject any payment or credit that would push
  a charge past its amount, any settlement of a voided charge, and any repricing
  below what has already been applied.

---

## Testing

```bash
npm test
```

59 tests across four suites:

| Suite | Covers |
| --- | --- |
| `tests/money.test.ts` | Cent parsing, formatting, float-drift resistance, round-trips |
| `tests/finance.test.ts` | Outstanding maths, every charge status, credit/payment guards, revenue |
| `tests/services.test.ts` | Session creation and charges, free sessions, conflicts, the four attendance states, cancel (void vs keep), duplication, roster add/remove, repricing, archive and soft delete, partial payments, double-submit rejection, cross-screen total consistency |
| `tests/authorization.test.ts` | Coach A cannot read or mutate Coach B's players, sessions, attendance or money, including by guessing ids |

---

## Known limitations

- **Dark theme** is a stored preference only; the dark palette is not
  implemented, and Settings says so rather than pretending otherwise. The
  design prototype only ever specified the light palette.
- **Transactions on Supabase.** PostgREST has no client-side `BEGIN`/`COMMIT`.
  Multi-step writes use a compensating-rollback unit of work, with the database
  triggers in `0002_financial_integrity.sql` as the real guarantee. Moving the
  compound operations into Postgres functions is the natural next step.
- **Rate limiting is per-instance.** `lib/security/rate-limit.ts` is a speed
  bump, not a distributed limiter. Supabase Auth's own limits and a platform
  WAF are the real defence.
- **Error reporting is not wired to a service.** Logging is structured and
  funnelled through `lib/observability/logger.ts`; call `setReporter()` with a
  Sentry (or similar) adapter to start receiving alerts.
- **The in-memory store is not persistent** and is single-process. It is for
  local development and tests only, and a production runtime refuses to use it.
- **"Send Reminder"** from the prototype is not implemented — it would require
  messaging, which is out of scope for the MVP.
- No payment processing. CoachOS records money, it never moves it.

## Still on you before selling this

Engineering-side work is done; these need decisions or accounts, not code.

- **Billing.** Deliberately out of scope. Subscriptions/Stripe is its own
  project.
- **Legal.** Privacy policy and terms. Note the shape of the problem: your
  coaches store *third parties'* names, phones and emails, which makes each
  coach a data controller and you a processor. That implies a DPA, a data
  export path, and a documented hard-delete on request. Player deletion here is
  currently a soft delete — correct for preserving financial history, and not
  sufficient on its own for an erasure request.
- **Backups.** Confirm point-in-time recovery is enabled on your Supabase plan.
  This is financial data.
- **Run the integration suite** against your real project once (see
  `tests/integration/README.md`). It is the only thing that proves your
  deployed RLS policies actually isolate tenants.
