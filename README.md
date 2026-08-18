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
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
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

### 3. Configure auth

**Authentication → Providers → Email**: enable it. For local testing, turning
**Confirm email** off lets you sign in immediately after signing up.

**Authentication → URL Configuration**: set the Site URL to your dev or
production origin.

### 4. Set environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

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
4. Add the two environment variables under **Settings → Environment Variables**
   (Production, Preview and Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy.
6. Back in Supabase, add the deployed origin to **Authentication → URL
   Configuration → Site URL / Redirect URLs**.

> If you deploy without the two variables set, the app still builds and runs,
> but on the in-memory demo store — every visitor sees the same demo data and
> nothing persists. Set the variables before sharing the link with anyone.

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
  data/                   the DataStore port and its two adapters
    mock/                 in-memory (development + tests)
    supabase/             Postgres via Supabase
supabase/migrations/      schema, integrity triggers, RLS policies
tests/                    vitest suites
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

### Authentication and authorization

Authentication is Supabase Auth (email + password). This application never sees,
hashes or stores a password. Sessions live in **httpOnly cookies** managed by
`@supabase/ssr` — never `localStorage` — and `middleware.ts` refreshes them on
each request and redirects signed-out traffic away from authenticated routes.

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
  implemented, and Settings says so rather than pretending otherwise.
- **Transactions on Supabase.** PostgREST has no client-side `BEGIN`/`COMMIT`.
  Multi-step writes use a compensating-rollback unit of work, with the database
  triggers in `0002_financial_integrity.sql` as the real guarantee. Moving the
  compound operations into Postgres functions is the natural next step.
- **The in-memory store is not persistent** and is single-process. It is for
  local development and tests only.
- **"Send Reminder"** from the prototype is not implemented — it would require
  messaging, which is out of scope for the MVP.
- **Attendance window** is stored and editable but does not yet change when a
  session is reported as missing attendance (currently: as soon as it ends).
- No payment processing. CoachOS records money, it never moves it.
