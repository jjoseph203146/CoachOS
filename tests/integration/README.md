# Integration tests

These run the **real** Supabase adapter against a **real** Postgres database and
assert that row-level security actually isolates tenants — the one thing the
offline suite cannot prove, because it exercises the in-memory adapter.

They are skipped automatically unless the environment is configured, so
`npm test` stays fast and offline.

## Setup (once)

1. Create a **separate** Supabase project for testing. Do not point these at
   production: the suite writes and deletes data.
2. Apply `supabase/schema.sql` to it.
3. Under **Authentication → Providers → Email**, turn **Confirm email** off so
   the fixture accounts can sign in immediately.
4. Create two accounts by signing up twice in the app (or via the dashboard),
   e.g. `coach-a@test.local` and `coach-b@test.local`.
5. Put the values in `.env.test.local` (gitignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<test-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<test anon key>
COACHOS_TEST_COACH_A_EMAIL=coach-a@test.local
COACHOS_TEST_COACH_A_PASSWORD=...
COACHOS_TEST_COACH_B_EMAIL=coach-b@test.local
COACHOS_TEST_COACH_B_PASSWORD=...
```

## Run

```bash
npm run test:integration
```

The suite cleans up everything it creates. It never uses the `service_role`
key — it signs in as ordinary users, which is precisely the point: it proves
the policies hold for the credentials the app actually ships with.
