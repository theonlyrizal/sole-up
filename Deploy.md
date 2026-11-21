# Deploy SoleUp for free, without a payment card

Last checked: **21 November 2026**. Provider plans can change; the official references are at the end.

## Recommendation

For your personal, non-commercial SoleUp deployment, use **Vercel Hobby for the entire Next.js app, Neon Free for PostgreSQL, and cron-job.org for scheduled reminders**. Choose the free account plans, not a paid-plan trial. You can use the included `vercel.app` address without buying a domain.

SoleUp is a full-stack Next.js application: pages, Server Actions, authentication and `/api/*` routes live in this repository. Vercel runs the server code as Node.js functions and serves the frontend. **You do not need another backend on Render alongside Vercel.** Splitting the frontend and backend would require application changes around Server Actions, sessions and origins; it is not a dashboard setting.

| Option                         | Frontend and server     | Database  | Scheduled jobs | Card / suitability                                                                                                                  |
| ------------------------------ | ----------------------- | --------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Suggested personal setup       | Vercel Hobby            | Neon Free | cron-job.org   | Free plans without a payment card; Vercel Hobby is restricted to personal, non-commercial use. Validate the serverless items below. |
| Existing repository deployment | Render Free web service | Neon Free | cron-job.org   | No card for the free services; matches the checked-in `render.yaml` and the single-process design. Render sleeps when idle.         |

**For the smallest change to the existing deployment design, choose Render. For your preferred Vercel setup, follow the Vercel section and its acceptance checks.** Neither free option promises uninterrupted service or unlimited usage.

This is a deployment guide and recommendation, not evidence that either host has been deployed successfully. The existing accepted hosting decisions remain in [ADR 0009](docs/decisions/0009-production-hosting.md) and [ADR 0013](docs/decisions/0013-reminders-sweep-and-delivery.md). The detailed Render operations and historical restore rehearsal remain in [docs/DEPLOY.md](docs/DEPLOY.md). If Vercel becomes the permanent host, record that decision and update the Render-specific privacy statements before inviting public users.

## 1. Accounts and prerequisites

Create these free accounts:

1. [GitHub](https://github.com): repository access and, optionally, the easiest first login provider.
2. [Neon](https://console.neon.tech): database, using its Free plan directly.
3. [Vercel](https://vercel.com/signup): personal Hobby account; or [Render](https://dashboard.render.com/register) for the existing deployment.
4. [cron-job.org](https://console.cron-job.org/signup): scheduler; confirm your email.
5. Optionally [Google Cloud Console](https://console.cloud.google.com) for Google sign-in. Creating an OAuth client does not require enabling paid Google Cloud resources or linking a billing account.

On your computer, use the versions committed in the repo:

| Tool       | Repository requirement                                                                |
| ---------- | ------------------------------------------------------------------------------------- |
| Node.js    | `.nvmrc` currently pins `24.22.0`; `package.json` accepts `^24.19.0`.                 |
| pnpm       | `packageManager` pins `12.21.0`; use that version and the committed `pnpm-lock.yaml`. |
| PostgreSQL | Local Docker configuration uses PostgreSQL 18. Choose 18 on Neon to match it.         |

From the repository root:

```powershell
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
```

The commands below use `pnpm`; if it is not available directly, use `corepack pnpm` in its place. Never upload `.env.local`, a database dump or OAuth secret files to GitHub. The checked-in `.env.example` is a template, not production configuration.

## 2. Understand the URLs first

Throughout this guide, replace `<APP_URL>` with the final stable HTTPS address, **without a trailing slash**:

```text
https://your-project.vercel.app
```

or:

```text
https://your-service.onrender.com
```

Use this same address in `BETTER_AUTH_URL`, OAuth settings and the scheduler. A deployment-specific preview address is not your permanent production address. Custom domains are optional and generally cost money to register.

## 3. Create the Neon database

1. Sign in to Neon and create a project named `soleup` on **Free**.
2. Choose PostgreSQL **18** and **AWS Singapore (`ap-southeast-1`)** if available. Place your app's server functions in the same region when possible; Bangladesh users also benefit from a nearby region.
3. Select the branch that will hold production data. Its initial name may differ; use the branch shown in your console, not an assumed name.
4. Open **Connect**, select the database and owner role, and copy **two** connection strings into your password manager:
   - **Direct:** connection pooling off; hostname has no `-pooler`.
   - **Pooled:** connection pooling on; hostname contains `-pooler`.
5. For the Node `pg` driver used here, replace `sslmode=require` with `sslmode=verify-full`. Keep other provider-supplied parameters such as `channel_binding=require`. Do not disable TLS verification.

Example shapes only; replace every placeholder with values from Neon:

```dotenv
# Direct: migrations, backups and the Render app
DATABASE_URL=postgresql://ROLE:PASSWORD@ep-example.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require

# Pooled: Vercel runtime
DATABASE_URL=postgresql://ROLE:PASSWORD@ep-example-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require
```

Copy Neon's complete string rather than building it yourself: credentials may require URL encoding. Neon supplies a database connection URL, **not** a Neon API key. This project uses its own Better Auth tables; you do not need to enable Neon's managed Auth product.

Use the direct connection for migrations in this guide. Vercel runtime instances should use the pooled connection to reduce pressure on Postgres connection limits. The app currently reads only `DATABASE_URL`: adding `DIRECT_URL` or `DATABASE_URL_UNPOOLED` to a dashboard will not make the migration script read it automatically.

## 4. Every environment variable and where to get it

Add production values to **Vercel > Project > Settings > Environment Variables**, scoped to **Production**, or **Render > Service > Environment**. Enter raw values without wrapping quotes. On Vercel, redeploy after changing them. On Render, save and redeploy.

The source of truth is [`src/server/env.ts`](src/server/env.ts). All required values below must exist even if you do not plan to use reminders immediately. The app can boot without OAuth credentials, but users cannot sign in until at least one complete provider pair is configured.

| Variable                          | Required?          | Where to obtain it / what to enter                                                                                                                                          |
| --------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Yes                | Neon project > **Connect**. Pooled for Vercel runtime; direct for Render runtime and migration commands. See section 3. Secret.                                             |
| `BETTER_AUTH_SECRET`              | Yes                | Generate locally using the command below. Minimum 32 characters. Use a different value from the sweep secret. Render Blueprint can generate this one automatically. Secret. |
| `BETTER_AUTH_URL`                 | Yes                | Your stable `<APP_URL>`, e.g. `https://your-project.vercel.app`. You choose it from your host's assigned domain; no API key needed.                                         |
| `GOOGLE_CLIENT_ID`                | For Google sign-in | Google Auth Platform > **Clients** > your Web application client > Client ID. See section 5.                                                                                |
| `GOOGLE_CLIENT_SECRET`            | With Google ID     | Same Google client > client secret. Save it when created. Secret.                                                                                                           |
| `GITHUB_CLIENT_ID`                | For GitHub sign-in | GitHub > **Settings > Developer settings > OAuth Apps** > your production app > Client ID.                                                                                  |
| `GITHUB_CLIENT_SECRET`            | With GitHub ID     | Same GitHub app > **Generate a new client secret**. Save it immediately. Secret.                                                                                            |
| `REMINDER_SWEEP_SECRET`           | Yes                | Generate locally using the command below. Minimum 43 characters. Also give this exact value to cron-job.org in the bearer header. Secret.                                   |
| `VAPID_PUBLIC_KEY`                | Yes                | Public Key output from `pnpm exec web-push generate-vapid-keys`. The app sends it to browsers; keep the variable name as written.                                           |
| `VAPID_PRIVATE_KEY`               | Yes                | Private Key output from the **same run**. Must match the public key. Secret.                                                                                                |
| `VAPID_SUBJECT`                   | Yes                | A contact you control: `mailto:you@example.com` or an HTTPS contact URL. No external credential needed.                                                                     |
| `COREPACK_ENABLE_DOWNLOAD_PROMPT` | Build setting      | Literal `0`. Included in `render.yaml`; set on Vercel when using the Corepack install command below.                                                                        |
| `NEXT_TELEMETRY_DISABLED`         | Optional           | Literal `1` to disable Next.js telemetry. Included in `render.yaml`.                                                                                                        |

Generate a strong secret with Node, on your own computer:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Run it **twice**: first result for `BETTER_AUTH_SECRET`, second for `REMINDER_SWEEP_SECRET`. Each result is 43 characters. Save them privately; do not paste secrets into a commit, screenshot, issue or chat.

Generate one VAPID pair for production:

```powershell
pnpm exec web-push generate-vapid-keys
```

No paid push service, Firebase account or credit card is needed for these keys. Keep the pair stable: changing it requires devices to subscribe again. Changing the auth secret invalidates existing sessions.

### Values you should not add to production

| Variable                                           | Why                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL`                                | Integration tests delete data; only use a dedicated local database ending in `_test`.                          |
| `SOLEUP_TEST_SIGN_IN`                              | Test-only login shortcut. Leave unset.                                                                         |
| `SOLEUP_NEXT_DIST_DIR`                             | Local test build directories. Leave unset.                                                                     |
| `PORT`                                             | Render supplies it; Vercel does not run `next start` as your own listening server.                             |
| `RENDER`                                           | Render supplies this itself. Do not copy it into Vercel; it changes the trusted IP header.                     |
| `NODE_ENV`                                         | Let the platform and Next.js manage it. Ensure the install step includes dev dependencies needed by the build. |
| `NEXT_PUBLIC_DATABASE_URL`, `NEXT_PUBLIC_*SECRET*` | Never expose secrets to the browser. This app currently requires **no** `NEXT_PUBLIC_*` variables.             |

Do not reuse production credentials or production data for Preview or Development deployments.

## 5. Set up login providers

**Start with GitHub if you want the fewest steps.** Google is optional, and either provider can be enabled later. Set both values for a provider or leave both unset; a half-configured pair fails environment validation.

### GitHub

1. Open [GitHub OAuth Apps](https://github.com/settings/developers), then **New OAuth app**.
2. Application name: `SoleUp production`.
3. Homepage URL: `<APP_URL>`.
4. Authorization callback URL: `<APP_URL>/api/auth/callback/github`.
5. Leave Device Flow disabled and register the app.
6. Copy **Client ID** to `GITHUB_CLIENT_ID`.
7. Generate a client secret and copy it to `GITHUB_CLIENT_SECRET`.

Use an **OAuth App**, not a GitHub personal access token or GitHub App private key. Create a separate OAuth app for localhost to keep development credentials isolated. GitHub's current documentation allows up to 10 callback URLs; the separate-app recommendation is for environment isolation, not a provider restriction.

### Google

1. In [Google Cloud Console](https://console.cloud.google.com), create or select a project, e.g. `soleup-prod`.
2. Open **Google Auth Platform**. Configure the app name, support email and developer contact email.
3. Choose **External** audience for personal Google accounts. For initial testing, keep **Testing** and add your own account under **Test users**. Only listed testers can use an app in testing.
4. SoleUp requests the basic `openid`, `email` and `profile` scopes. Do not enable unrelated APIs or scopes.
5. Under **Clients**, create a **Web application** client:
   - Authorized JavaScript origin: `<APP_URL>`.
   - Authorized redirect URI: `<APP_URL>/api/auth/callback/google`.
6. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Before allowing general Google sign-in, complete the audience/publishing requirements shown by Google and provide accurate app privacy details.

### OAuth production callback URLs

| Provider | Example for Vercel                                         |
| -------- | ---------------------------------------------------------- |
| Google   | `https://your-project.vercel.app/api/auth/callback/google` |
| GitHub   | `https://your-project.vercel.app/api/auth/callback/github` |

For Render, replace the origin with your `onrender.com` address. If you later change domain, update `BETTER_AUTH_URL`, provider origins/callbacks and the cron URL together, then redeploy. Use one canonical domain for sign-in.

## 6. Deploy on Vercel

### A. Import and configure

1. Push the repository and committed migration files to GitHub. Review the existing CI checks before a production release.
2. In Vercel, choose **Add New > Project**, import this repository into your personal **Hobby** account, and select **Next.js**.
3. Use repository root `.` and production branch `main`.
4. Select **Node.js 24.x**, compatible with `package.json`. Vercel chooses the available patch version; it does not promise the exact `.nvmrc` patch.
5. Use these build settings:

| Setting          | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Framework preset | Next.js                                                            |
| Install command  | `corepack pnpm install --frozen-lockfile --prod=false`             |
| Build command    | `pnpm build`                                                       |
| Output directory | Leave the Next.js default; do not set `out` or `public`.           |
| Start command    | None; Vercel manages the runtime.                                  |
| Function region  | Singapore (`sin1`) if available on your plan; match Neon's region. |

6. Add the required variables from section 4 to **Production**, with the **pooled** Neon URL for `DATABASE_URL`. Vercel already controls `NODE_ENV`; `--prod=false` explicitly installs build tooling.
7. Reserve/check the assigned production domain and use it for `<APP_URL>`. If the final URL is only visible after import/deploy, update `BETTER_AUTH_URL` and OAuth callbacks once it appears, then redeploy before testing login. An initial successful build alone does not mean runtime configuration is complete.
8. Keep the Node.js runtime. Do not change the app to Edge runtime or static export: it uses `pg`, Node crypto, server sessions, Server Actions and dynamic rendering.

### B. Apply database migrations separately

**Do not put production migrations in Vercel's generic build command.** Preview builds and simultaneous builds must not mutate your production schema. The existing release script reads `DATABASE_URL` from the process environment only; it does not read `.env.local`.

For the first deployment and each release containing new migrations:

1. Check that the release passed CI and review the migration SQL. Back up any existing production data first.
2. From that exact release commit, run the existing migration script **once** using Neon's **direct** connection string.
3. Deploy/promote that release to Production and verify its health.

PowerShell example; the prompt keeps the connection URL out of the command history:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
$databaseCredential = Read-Host 'Paste Neon DIRECT production URL' -AsSecureString
try {
  $env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $databaseCredential).Password
  pnpm db:migrate:deploy
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Do not release this version.' }
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  $databaseCredential.Dispose()
}
```

Expected final line: `db:migrate:deploy: done.` The script applies committed pending migrations transactionally. Never use `db:reset`, `db:seed:performance`, integration tests or schema push against production. Migrations must remain compatible with the version still running and the rollback version.

On first setup, run migrations before treating the imported app as live. For later releases, coordinate migrations before the production deploy: Vercel's normal Git integration can begin deploying immediately on a push and does **not** automatically inherit Render's `checksPass` setting. Keep production releases manual/coordinated until a CI-gated release workflow is configured. No such Vercel release workflow is added by this guide.

### C. Preview deployments

Use a separate Neon project/database and separate secrets for Preview. Do not scope production secrets to all environments. If enabling OAuth in a preview, use a stable staging URL with separate OAuth credentials; arbitrary changing preview URLs will not match your production callback. Keep preview deployment protection enabled as appropriate, and run any staging migrations against the staging database only.

### D. Serverless acceptance checks

Vercel supports Next.js, but this repository's deployment design assumes a single Node process. Before relying on the Vercel deployment:

- **Authentication limits:** Better Auth currently stores rate-limit counters in memory (`src/server/auth/auth.ts`). On Vercel they are per function instance and reset on cold starts; the documented per-IP limits are not a global ceiling. For a broader public release, implement and validate a shared limiter or equivalent platform protection first.
- **Database connections:** `src/server/db/client.ts` uses `pg.Pool` with default sizing and no Vercel-specific lifecycle management. Use Neon's pooled URL; observe connection counts and repeat requests after idle periods. A tested pool lifecycle/concurrency configuration is needed before significant traffic, even with PgBouncer.
- **Trusted IP:** leave `RENDER` unset. The current non-Render path uses `x-forwarded-for`; Vercel documents overwriting that header. Confirm authentication requests do not log `Rate limiting could not determine a client IP`, and review trust again if adding another reverse proxy.
- **Reminder duration:** the sweep sends pushes within the request and can claim up to 200 reminders per batch. It is not a persistent background worker. Measure sweep duration and verify completion after cold starts; both Vercel's function duration and cron-job.org's 30-second timeout matter. A longer function limit does not lengthen the scheduler's timeout.
- **Accurate privacy information:** the current public privacy page and operations docs describe Render. Update the processor/hosting and retention statements for Vercel before a public launch.

These are known migration checks, not claims of completed Vercel testing. Render remains the existing single-process alternative if these limitations are unsuitable.

## 7. Alternative: use the checked-in Render setup

This hosts **both frontend and backend** on Render. Use Neon and the same credentials/scheduler described above.

1. Open Render and select **New > Blueprint**. Connect this repository and branch `main`.
2. Confirm `render.yaml` proposes one **Free** Node web service in **Singapore**. It does not create a Render database.
3. Supply Neon's **direct** URL as `DATABASE_URL`, generate the sweep/VAPID values from section 4, and enter `VAPID_SUBJECT`.
4. The Blueprint generates `BETTER_AUTH_SECRET` for you. Use the actual assigned service domain for `BETTER_AUTH_URL` and provider callbacks. Leave both variables of an unused OAuth provider unset/empty if the form permits; at least one pair is needed for usable login.
5. If you only learn the domain after creation, set the final URL and OAuth values then **Save, rebuild and deploy**. Do not stop at an initial deployment with missing values.
6. Verify the build and health check. The detailed guide is [docs/DEPLOY.md](docs/DEPLOY.md).

The existing Blueprint runs:

```sh
corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm db:migrate:deploy
```

and starts with:

```sh
pnpm start
```

It uses `.nvmrc`, waits for GitHub checks before automatic deployments, and checks `/api/health`. Free Render has no paid pre-deploy hook, so migrations run as the last build step. Avoid overlapping production builds/migrations. A successful schema migration persists even if a later runtime startup fails.

**Choose a web service, not a static site. Do not use free Render Postgres as the permanent database:** its free database expires after 30 days. Neon is the database in this plan.

## 8. Schedule reminders using cron-job.org

Use the same setup for Vercel or Render. The route also finalizes expired account-deletion recovery windows, so keep the sweep scheduled even if you rarely use push notifications.

1. Create a job named `SoleUp reminder sweep`.
2. URL: `<APP_URL>/api/reminders/sweep` (HTTPS, final domain, no redirect).
3. Schedule: **every 15 minutes**, or custom cron `*/15 * * * *`.
4. Request method: **POST**; body empty.
5. Add the custom header:

   ```text
   Authorization: Bearer <the actual REMINDER_SWEEP_SECRET value>
   ```

6. Enable failure/disabled-job email notifications and response history. Do not treat redirects as successful execution.
7. Run a test. Expect **200** and JSON with `counts` and `durationMs`. Match it to the app log `Reminder sweep finished`.
8. Check four successful scheduled runs over an hour and confirm Settings > Reminders no longer warns about a stale sweep.

The actual app secret is `REMINDER_SWEEP_SECRET`, not `CRON_SECRET`. Do not put it in the URL query string. Do not configure a GET ping: this endpoint exports POST only. Vercel Hobby's built-in cron is limited to daily execution and cannot replace this 15-minute schedule.

The 15-minute interval matches `SWEEP_INTERVAL_MINUTES` in `src/lib/reminders.ts`: reminders can arrive up to 15 minutes early; scheduler outages can cause delays or stale reminders to be skipped. Do not widen the interval without reviewing that code and the reminder behavior.

cron-job.org times out after **30 seconds**. A timeout does not prove that every database change or push was canceled: inspect app logs before manually retrying. Repeated failures can disable the job. Render's approximately one-minute wake-up can exceed that timeout; the app's settings warning and scheduler alerts must be monitored. The existing [Render reminder runbook](docs/DEPLOY.md#reminder-sweep) describes the cold-start tradeoff.

For Vercel, use the public production URL. If deployment protection or a firewall blocks the scheduler, arrange a supported, scoped machine-access bypass and store that bypass credential privately in the scheduler; do not weaken the sweep bearer-secret check. A Vercel login page, redirect or challenge response is not a successful sweep.

## 9. Verify the deployment

Replace the sample domain before running these PowerShell commands:

```powershell
$appUrl = 'https://your-project.vercel.app'
Invoke-RestMethod -Uri "$appUrl/api/health"
curl.exe -i -X POST "$appUrl/api/reminders/sweep"
```

Expected:

- Health: HTTP **200**, `{"status":"ok","database":"ok"}`. A green build alone does not check your live database.
- Unauthenticated sweep: HTTP **401**. Then use cron-job.org's authenticated test to verify **200**; never remove authorization to make a test pass.
- Google/GitHub sign-in works for each enabled provider, including sign-out and sign-in again. Confirm your time zone (for example `Asia/Dhaka`).
- Create a life area and task, refresh, then redeploy. Both should still exist, proving data lives in Neon.
- Enable browser notifications and use **Send test notification**. HTTPS, browser support and notification permission are required. For iOS/iPadOS Web Push, use a supported installed Home Screen web app.
- Create a reminder and verify its push arrives through a scheduled sweep with the browser tab closed. Check quiet hours and early-delivery behavior.
- Verify private routes redirect anonymous users and `/dev/ui` is unavailable in production.
- On Vercel, repeat sign-in, health and push tests after the app/database have been idle, and inspect pool/timeout errors.

Record the release commit, final domain, host, database branch, migration result and smoke-test results in your deployment notes. Never record secret values.

## 10. Free limits and how to stay at zero cost

| Service      | Main limitations to monitor                                                                                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby | Personal, non-commercial use. Usage caps can pause features. Runtime functions are bounded; no always-running Node worker. Built-in cron is daily on Hobby. Use the dashboard for current compute/bandwidth allowances.                                                                                        |
| Neon Free    | Current pricing advertises 100 CU-hours per project/month and 1 GB storage per project; branch, transfer and restore limits also apply. Compute scales to zero after idle time. Check actual project usage and restore settings.                                                                               |
| Render Free  | Sleeps after 15 idle minutes; waking takes about a minute. 750 instance hours per workspace/month, shared across free services. Local files are ephemeral; no free persistent disk or background worker. Without a payment method, exhausted bandwidth/build allowances lead to suspension or disabled builds. |
| cron-job.org | Free scheduled HTTP calls; 30-second response timeout and fair-use restrictions. Watch failures and auto-disable notices.                                                                                                                                                                                      |

Select only free plans and keep payment details absent. If a signup or verification flow requires a card for your account, stop that flow: no-card availability for an individual account is not guaranteed by this guide. Avoid paid marketplace integrations and domain purchases; connect Neon manually with `DATABASE_URL`.

**Neon compute budget:** at 0.25 CU, a wake every 15 minutes followed by 5 minutes active is approximately `31 × 24 × (5 / 15) × 0.25 = 62 CU-hours/month` before interactive usage. This is an estimate, not a quota reservation: health checks, open connections, longer queries, autoscaling and user activity can raise it. Do not add frequent database health pings just to keep the app awake. Monitor usage weekly; investigate a projection near 80 CU-hours before exhausting the allowance.

Render running continuously for a 31-day month uses 744 of its shared 750 hours. Multiple free services can exceed that budget. Free availability, reminder timeliness and data recovery have limits; review a paid plan before depending on this as a broadly used service.

## 11. Updates, rollback and backups

### Release updates

Review CI, back up data before risky migrations, apply only committed migrations and run the smoke checks after release. On Render the Blueprint handles the release migration. On Vercel use the separate, serialized direct-URL migration step above. A database migration can affect the old version before traffic switches, so use backward-compatible additions before removing old structures in a later release.

### Roll back code

- Vercel: use the deployment dashboard's rollback/promotion controls for a known-good production deployment. Verify current environment settings as well as code.
- Render: select a previous stored deploy and use **Rollback**. Free limits how many previous deploys are available; check whether automatic deploys need re-enabling afterward.
- Either host: rollback of code does **not** undo database migrations. Prefer a forward corrective migration. Do not erase the migration journal or run `db:reset` to attempt a rollback.

### Back up the database

Check Neon's configured restore history before relying on point-in-time recovery; the available window is limited by your plan. Also keep an encrypted independent dump before migrations and regularly while using the app. The dump contains users' private data and must stay outside the repository.

With PostgreSQL 18 client tools installed and a direct Neon URL supplied privately in `DATABASE_URL` (the secure PowerShell prompt from section 6 can be reused):

```powershell
$backupFile = Join-Path $env:TEMP ('soleup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
pg_dump --dbname="$env:DATABASE_URL" --format=custom --no-owner --no-privileges --file="$backupFile"
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; do not treat the output as a valid backup.' }
```

The URL is supplied to the local client process; use a private machine. Move the successful dump to encrypted storage you control and apply your retention policy. Temporary storage is not a durable backup. Use client tools at least as new as the database server, and clear/restore the shell variable afterward.

### Restore safely

1. Pause writes and the cron job while recovering. Establish which release and restore time you need; writes after that point will be lost.
2. Prefer a new empty database/branch. Inspect available Neon history or restore your dump into that new target with `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname="$env:RESTORE_URL" -- "$backupFile"`, after privately setting `RESTORE_URL` to the **new target's direct URL**. Check its exit code.
3. Verify table counts, the `drizzle.__drizzle_migrations` journal and representative records. Test the matching application release against the restored target.
4. Only after verification, point the app's `DATABASE_URL` at the recovered database (pooled on Vercel, direct on Render), apply any needed compatible migrations and redeploy.
5. Run health, authentication and data checks, then re-enable the cron job. Sessions restored to an earlier point may require users to sign in again.

The historical [restore rehearsal](docs/DEPLOY.md#local-restore-rehearsal) provides an additional verification procedure. A successful local drill is not proof that a current production backup is restorable: test your own dump in an isolated target.

## 12. Troubleshooting

| Symptom                                                   | What to check                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment variables`                           | Required values from section 4; no blank strings, no single half of an OAuth pair, sweep secret at least 43 characters, matching VAPID keys. Redeploy after edits.                 |
| Build cannot find pnpm or rejects its version             | Enable/use Corepack and the committed `packageManager`; confirm install output uses pnpm 12.21.0 and Node 24.                                                                      |
| Build cannot find TypeScript, Tailwind or Drizzle tooling | Install dev dependencies; on Vercel use the explicit `--prod=false` command.                                                                                                       |
| Health 503 / relation does not exist                      | Correct Neon branch/URL, database quota and successful committed migrations. A `next build` can succeed without a working runtime database.                                        |
| Database TLS error                                        | Recopy the URL, check `sslmode=verify-full` and provider parameters. Do not use `rejectUnauthorized: false`.                                                                       |
| Too many database connections                             | Use pooled URL on Vercel, inspect pool/concurrency behavior and Neon connection usage. Direct URL remains for migration/backup commands.                                           |
| OAuth `redirect_uri_mismatch` / callback error            | Exact scheme, hostname and `/api/auth/callback/google` or `/github`; `BETTER_AUTH_URL` must use the same production origin.                                                        |
| Google denies sign-in                                     | Add your email as a tester while Testing; review publishing/audience requirements before general access.                                                                           |
| No provider on sign-in page                               | Configure at least one complete OAuth ID/secret pair, scoped to Production, and redeploy.                                                                                          |
| Cron 401                                                  | Exact `Authorization: Bearer VALUE` header and same sweep secret on the app and scheduler.                                                                                         |
| Cron 405                                                  | Scheduler is sending GET; change to POST.                                                                                                                                          |
| Cron redirect, HTML, 403 or timeout                       | Wrong origin, deployment protection/firewall, Render wake-up, Neon wake-up or long sweep. Inspect both scheduler history and app logs.                                             |
| Push never arrives                                        | Correct VAPID pair/contact; browser permission, HTTPS, device subscription, quiet hours, stale reminder status and scheduler success. Re-enable notifications after changing keys. |
| Production works but Preview fails                        | Separate preview environment/DB and OAuth callback are needed; production values are not automatically valid for preview origins.                                                  |
| App stops after weeks of use                              | Check host/Neon quota dashboards and scheduler auto-disable email before assuming data was deleted.                                                                                |

## Official references

Provider documentation was consulted on 21 November 2026. Dashboard labels and entitlements may change; confirm the free plan before provisioning.

- [Vercel Hobby](https://vercel.com/docs/plans/hobby), [pricing](https://vercel.com/pricing) and [terms / commercial-use restriction](https://vercel.com/legal/terms).
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [function limits](https://vercel.com/docs/functions/limitations), [request headers](https://vercel.com/docs/headers/request-headers) and [cron usage](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).
- [Neon pricing and no-card Free plan](https://neon.com/pricing) and [connection pooling](https://neon.com/docs/connect/connection-pooling).
- [Render Free limits](https://render.com/docs/free) and [no-card hosting information](https://render.com/hosting/docker).
- [cron-job.org FAQ](https://cron-job.org/en/faq/).
- [Google web OAuth credentials](https://developers.google.com/identity/protocols/oauth2/web-server) and [creating a GitHub OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
- Repository Next.js 16.4.3 documentation: `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md` and `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`.
