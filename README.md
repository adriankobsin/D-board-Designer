# DBoard Designer: accounts, cloud projects and admin console

DBoard Designer (the existing designer, unchanged in function) now runs behind a Cloudflare Worker with Supabase
Authentication and Postgres. Users register, verify their email, sign in, keep projects in the cloud, and an
administrator console manages users and feedback.

```
Browser (public/index.html) ──supabase-js, anon key──▶ Supabase Auth + Postgres (Row Level Security)
   │
   └── /api/* ──▶ Cloudflare Worker (src/worker.js) ──service-role key (secret)──▶ Supabase
                  admin API, account deletion, /api/config, security headers
```

Nothing privileged is in the browser. The service-role key exists only as a Worker secret. Administrator rights are
checked on the server on every `/api/admin/*` call (token validated with Supabase, then `profiles.role = 'admin'` and
`status = 'active'`), and row access is enforced in the database by RLS.

Live site: https://d-board-designer.adriankobsin.workers.dev (Cloudflare Worker `d-board-designer`, deployed from the
GitHub repo `adriankobsin/D-board-Designer`, branch `Main`).

**How updates reach the site.** Cloudflare is connected to the repo (Workers & Pages, d-board-designer, Settings, Builds:
build command `npm run build`, deploy command `npx wrangler deploy`). Every push to `Main` builds and deploys automatically,
usually within a couple of minutes. A failed build leaves the previous version live. Changes to the database are the one
thing that is **not** automatic: new SQL in `supabase/migrations/` must be run in the Supabase SQL Editor. Secrets and
Supabase Auth settings change only when you change them.

**If Supabase is not configured the app works exactly as before** (local storage, no login). Set the variables below
to switch the account system on.

## What you need to supply

| Item | Where it comes from |
|---|---|
| A Supabase project | https://supabase.com, New project |
| `SUPABASE_URL` and `SUPABASE_ANON_KEY` | Supabase, Project Settings, API (the anon/public key is safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page. **Secret.** Only ever stored as a Cloudflare secret. |
| An SMTP provider (strongly recommended) | Resend, Postmark, SendGrid, Mailgun, Amazon SES. Supabase's built-in mailer allows only a few emails per hour and is for testing |
| Your Cloudflare Worker | You already have `d-board-designer` connected to GitHub |
| An Anthropic API key (only for panel import) | https://console.anthropic.com. Usage is billed to you per analysis |

## 1. Create the database

Supabase, SQL Editor: paste and run `supabase/migrations/0001_init.sql` (idempotent). If you already ran an earlier copy of it, also run `0003_import_events.sql`. For sharing and chat, also run `0004_community.sql` (see the Community section). It creates `profiles`, `projects`,
`feedback`, `usage_events`, `admin_actions`, the sign-up trigger, RLS policies and two admin functions that only the
service role can call.

## 2. Configure Supabase Auth

Authentication, Providers, Email: **enabled**, **Confirm email: ON** (this gates access until the address is verified).

Authentication, URL Configuration:
- **Site URL**: your Worker URL, e.g. `https://d-board-designer.adriankobsin.workers.dev` (or your custom domain).
- **Redirect URLs**: the same URL and `https://d-board-designer.adriankobsin.workers.dev/**`. Add `http://localhost:8787/**` for local runs.

Authentication, Emails, SMTP Settings: enable custom SMTP (host, port, user, password, verified sender address).
**Do this before inviting anyone.** Supabase's built-in sender allows only a few emails per hour for the whole project, so
sign-ups fail with `429: email rate limit exceeded` once it is used up. After custom SMTP is on, raise Auth, Rate Limits,
"Emails sent per hour". For short tests only you can switch off Confirm email, then switch it back on.
In Email Templates keep `{{ .ConfirmationURL }}` in **Confirm signup** and **Reset password**.

Set a minimum password length of 8 or more. The app also enforces 8+ characters with a letter and a number.
Before a public launch also review Auth rate limits and enable CAPTCHA (Auth, Bot and Abuse Protection).

## 3. Configure and deploy the Worker

1. Edit `wrangler.jsonc` and fill in the two **public** values (values in this file override dashboard values on each deploy, so keep them here):
   ```jsonc
   "vars": { "SUPABASE_URL": "https://xxxx.supabase.co", "SUPABASE_ANON_KEY": "eyJ...", "REQUIRE_LOGIN": "true" }
   ```
   `REQUIRE_LOGIN: "false"` keeps accounts optional (visitors can still use the designer without signing in).
2. Set the secrets (never in a file):
   ```
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put ANTHROPIC_API_KEY      # only if you want panel import
   ```
   or Cloudflare dashboard, Workers, your Worker, Settings, **Variables and Secrets** (the Runtime one, not the Builds one), add a **Secret**,
   then press Deploy. Import switches on only when **both** secrets are present.
3. Deploy:
   ```
   npm install
   npm run build     # optional: public/ is already built and included
   npx wrangler deploy
   ```
   With the Cloudflare/GitHub integration the build command can stay empty because `public/` is committed.

### Environment variables

| Name | Type | Required | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | var | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | var | yes | Public anon key (RLS protects the data) |
| `REQUIRE_LOGIN` | var | no (default `true`) | Force sign-in before the designer |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | for admin console, account deletion and import limits | Server-side only |
| `ANTHROPIC_API_KEY` | **secret** | for panel import | Key from console.anthropic.com. Server-side only. Import is off without it |
| `ANTHROPIC_MODEL` | var | no (default `claude-sonnet-5-5`) | Vision model used to read panels |
| `IMPORT_DAILY_LIMIT` | var | no (default `20`) | Analyses per user per 24 h, to cap your API cost |
| `RESEND_API_KEY` | **secret** | for invitation and share emails | Key from resend.com. Without it, people are notified on the dashboard only |
| `MAIL_FROM` | var | with `RESEND_API_KEY` | Sender, e.g. `DBoard Designer <noreply@your-domain.com>` (domain verified in Resend) |
| `APP_URL` | var | no | Address used in email links |

## 4. Create the first administrator

1. Register in the app and confirm the email.
2. Supabase, SQL Editor (also in `supabase/migrations/0002_make_first_admin.sql.example`):
   ```sql
   update public.profiles set role = 'admin' where lower(email) = lower('you@example.com');
   ```
3. Sign in again. **Admin dashboard** appears in the profile menu. The browser cannot set `role` or `status`.

Admins can search and filter users, see registration date, verification, project counts and last activity, suspend and
reactivate accounts (this also bans the auth user so refresh tokens stop working), and review feedback. Admins cannot
suspend other admins or themselves. Every status change is logged in `admin_actions`.

## 5. Behaviour

- **Register**: first/last name, email, password + confirm, optional company, country, occupation, Terms and Privacy
  acceptance (stored as `accepted_terms_at`). A confirmation email is sent; unverified accounts cannot sign in.
- **Sign in**: Remember me keeps the session across browser restarts; otherwise it ends with the tab. Sessions refresh
  automatically; an expired session returns the user to sign-in with a message.
- **Forgot password**: emailed link opens a "choose a new password" screen. **Change password** (Account) asks for the current one.
- **Dashboard**: welcome, new board, recently opened, saved projects (search, open, rename, duplicate, delete), feedback form.
- **Cloud projects**: edits auto-save after 1.5 s; the header chip shows Saved / Saving / Offline / Not saved. If the project
  changed on another device the user chooses to keep their version or load the saved one.
- **Local projects are never touched.** While a cloud project is open, edits do not overwrite the browser's local board.
  The dashboard offers "Upload a copy" of the local board; the local copy is kept. "Open local board" works without the cloud.
- **Exports** (PDF, Excel, CSV, JSON) work for cloud and local boards. On the PDF you tick which sections to include (cover page, panel layout, multi-line diagram, DALI network and module layout, circuit schedule, bill of materials). The cover page carries your logo, company name and the company details from Setup.
- **Account**: edit profile, change password, download all data (JSON), delete account (type your email; removes the auth
  user, profile and projects; the last remaining admin cannot be deleted).
- **Offline**: the designer shell is cached; cloud projects need a connection to load; edits retry on reconnect while the tab stays open.

## 6. Panel import from a photo or PDF

**Dashboard, Import** (or the profile menu, Import a panel). Add up to four photos of one panel, or one PDF
(schematic, single-line diagram or circuit schedule). The Worker sends them to a vision model, which transcribes every
device it can read: kind, rating, curve, poles, RCD, circuit reference and label, load, phase, cable, manufacturer and
model, with a confidence for each. You then **review and edit** a table next to your photo (or PDF) before anything is
created, then press **Create board**.

- A board is built from the reviewed table: circuits (MCB/RCBO with the as-found rating kept as the breaker rating),
  the main switch, surge protection, and everything else (RCCBs, contactors, relays, meters, power supplies, controllers,
  terminals) as custom devices, in reading order. It opens as a normal cloud project, so the calculations, checks, panel
  layout, multi-line diagram, bill of materials, PDF, Excel and CSV exports all work on it, and you can keep editing.
- Anything the reader could not see stays blank and is flagged. Blank loads are estimated at 80% of the breaker rating,
  phases that cannot be read are assigned in rotation, and a list of these assumptions is shown after the board is created.
- Photos are resized in the browser. Photos and PDFs go to the reading service for analysis and are not stored by this app.
- Each analysis costs API usage on your key. `IMPORT_DAILY_LIMIT` caps it per user. Admins see `import_analyzed` counts in the usage stats.

Honest limits: reading a photo is a best effort. Glare, angle, small print, labels hidden by wires and dense boards will
cause misses or wrong digits, which is why the review step is mandatory. Always check ratings and phases against the real
panel before issuing the result as as-built documentation. The reading itself could not be tested here without an API
key (see Testing).

## 7. Testing

```
python3 pgtest/rls_test.py          # database policies against real local Postgres 16 (stubs Supabase roles/auth schema): 47 checks

# Worker + browser flows, using a TEST-ONLY mock of Supabase (never deployed)
npm install && bash build.sh
node test/mock_supabase.js &        # port 54321
printf 'SUPABASE_SERVICE_ROLE_KEY=test-service-role-key\n' > .dev.vars
npx wrangler dev --port 8799 --var SUPABASE_URL:http://127.0.0.1:54321 --var SUPABASE_ANON_KEY:test-anon-key --var REQUIRE_LOGIN:true &
node test/mock_anthropic.js &       # port 54400, fixed answers, does not read images
printf 'ANTHROPIC_API_KEY=test-anthropic-key\n' >> .dev.vars
# add to the wrangler dev command above: --var ANTHROPIC_BASE_URL:http://127.0.0.1:54400 --var IMPORT_DAILY_LIMIT:4
python3 test/e2e.py && python3 test/e2e2.py && python3 test/e2e3.py     # pip install playwright pillow
```

**What this proves and does not.** The browser tests drive the real Worker and real front-end against a mock that imitates
Supabase's API, so they cover the app's logic: validation, routing, session restore, auto-save, conflicts, admin gating,
deletion, recovery links, and the whole import flow (upload, review, edit, create, exports, request shape, validation, rate limit). The RLS tests cover the SQL policies on real Postgres. The import tests use a stand-in that returns fixed answers, so they prove the plumbing and the board building, **not how accurately the real model reads a real panel**. They do **not** cover real email delivery,
real Supabase Auth behaviour, your SMTP setup or Cloudflare production. Run the smoke test below on your deployment before
inviting beta users.

### Manual smoke test on your deployment

1. Register with a real address, receive the email, click the link, land on the dashboard.
2. Sign out, sign in with Remember me, close and reopen the browser: still signed in.
3. Forgot password, email, set a new password, signed in.
4. Create a board, edit, wait for "Saved to your account", open the site on a phone: the project is listed and opens.
5. With a second account in another browser, confirm it cannot see the first account's projects.
6. Promote yourself to admin, open Admin dashboard, suspend and reactivate the second account.
7. Delete the second account from Account settings.
8. Import: photograph a real panel (or use a PDF schematic), review the table against the panel, create the board and compare circuits, ratings and phases with the real thing.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| No login screen | URL/anon key empty or not deployed. `https://YOUR-SITE/api/config` must show `"configured":true` |
| No verification email | SMTP not set up (built-in sender is heavily limited); check spam; Supabase, Auth, Logs |
| Email link shows an error or wrong site | Site URL / Redirect URLs not set (section 2) |
| "Email or password is incorrect" for a new user | Email not confirmed yet, or wrong password |
| Dashboard cannot load projects | Migration not run, or the anon key is from a different project |
| Admin: "Administrator API is not configured" | `SUPABASE_SERVICE_ROLE_KEY` secret missing |
| Import page says it is not switched on | `ANTHROPIC_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` secret missing (`/api/config` shows `importEnabled`) |
| Import: "reading service rejected the server key" | Wrong or revoked `ANTHROPIC_API_KEY` |
| Import: daily limit reached | Raise `IMPORT_DAILY_LIMIT` |
| Import returns few or wrong devices | Retake straight-on without glare, add close-ups of each row, add a note (e.g. label language) |
| Sign-up fails for new users (first one worked) | Supabase's built-in email limit (`429: email rate limit exceeded` in Auth logs). Set up custom SMTP (section 2) and raise the hourly limit |
| The site opens a Cloudflare Access login ("Log in to d-board-designer - Cloudflare Workers") | Cloudflare Access is switched on for the workers.dev address. Workers, d-board-designer, Settings, Domains and Routes: disable Cloudflare Access (and for Preview URLs). If needed delete the application "d-board-designer - Cloudflare Workers" in Zero Trust, Access controls, Applications |
| Updates do not appear | Check Workers, d-board-designer, Deployments for a failed build. Hard-refresh once for the service worker cache |
| Import still says not switched on after adding keys | The secrets must be in Settings, Variables and Secrets (Runtime), named exactly `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, then Deploy. `/api/health` shows `"admin":true` when the service-role secret is visible and `"anthropic":true` when the Anthropic key is visible (true/false only, never the keys). Keys added as plain Text variables, or under Builds, are not seen or are wiped on the next deploy: use Type Secret in Runtime |
| Admin: 403 | `profiles.role` is not `admin`, or the account is suspended |
| Console: CSP connect-src violation | The page may only call your configured Supabase origin; check `SUPABASE_URL` |
| Old version after deploy | Service worker cache; hard-refresh once (bump `VERSION` in `src_app/sw.js` each release) |

## Making changes

Edit the sources (`designer/`, `src_app/`, `src/`), run `bash build.sh` to rebuild `public/`, commit and push to `Main`.
`public/` is committed on purpose, so the deploy works even if the build step is skipped. Bump `VERSION` in
`src_app/sw.js` for releases that change the front end so installed copies refresh. The in-app Help is `renderHelp()` in
`designer/ui.js`; keep it in step with this README when features change.

## Data and privacy

Stored per user: name, email, country, occupation, optional company, terms-acceptance time, last seen, projects, feedback
and coarse usage events (sign-in, project created/opened, exports, tools opened, feedback sent). No passwords (Supabase
stores salted hashes), no IP addresses in app tables, no third-party analytics. Users can export and delete their data.
The Terms and Privacy texts (`SA_LEGAL` in `src_app/saas3.js`) are **templates**: complete the operator details and have a
lawyer review them before public launch. Auth and admin screens are translated for the core strings only; the rest falls
back to English.

## Layout

```
wrangler.jsonc  package.json  build.sh  build_saas.py
src/worker.js              Worker: config, admin API, account deletion, import endpoint, security headers
src/importer.js            import prompt, tool schema, request validation, output sanitiser
src_app/saas1..5.js, saasimp.js   account + import layer (build.sh concatenates them into saas.js)  saas.css  sw.js
designer/                  original designer sources     pwa_base/  shell template, icons, manifest, xlsx/jspdf
vendor_src/supabase.js     supabase-js 2.117.3 (vendored for offline use)
public/                    built output served by the Worker
supabase/migrations/       SQL            pgtest/  test/   test-only code, not deployed
```

## Community: sharing, private chats, group chats, notifications

Members can share a saved project with other registered members, chat privately, create group chats and invite others by email. People see a bell on the dashboard for invitations, replies and shared projects.

**Setup (three steps)**

1. **Database.** In the Supabase SQL editor, run `supabase/migrations/0004_community.sql` once. It is safe to run again. Until it is run, the Community page shows "not set up yet".
2. **Invitation emails (optional but recommended).** The Worker sends email through [Resend](https://resend.com). Create an API key and verify a sending domain there, then set:
   - secret `RESEND_API_KEY`: `npx wrangler secret put RESEND_API_KEY` (or Cloudflare dashboard, Worker, Settings, Variables and Secrets)
   - variable `MAIL_FROM`, for example `DBoard Designer <noreply@your-domain.com>`
   - optional variable `APP_URL` (the address used in the email links; defaults to the address the request came to)

   Without `RESEND_API_KEY` everything still works; people are told on their dashboard only, and the dialog says no email was sent. `SUPABASE_SERVICE_ROLE_KEY` must already be set (creating chats, inviting and sharing look members up by email, which only the Worker can do).
3. **Deploy.** Push to GitHub as usual.

**How it behaves**

- **Share a project:** Dashboard, Share on a project card, enter one or more email addresses and an optional message. Only registered members can receive it. They can view it and save their own copy ("Open a copy"); only the owner can change the original. The owner can stop sharing at any time.
- **Private chat:** Community, New private chat, enter a member's email. Opening it again reuses the same conversation.
- **Group chat:** Community, New group. Any member can create one and invite others by email; the creator is the owner and can invite more people, cancel invitations and remove members. Invited members get an email and a dashboard notification, and only see messages after they accept. If the owner leaves, the longest-standing member becomes owner; the group is deleted when the last member leaves.
- **Notifications:** the bell and the Community tab show unread counts. Several replies in one chat are grouped into one notification. The page checks for new notifications every 30 seconds and the open chat every 4 seconds (no live socket).
- **Safety:** messages are plain text, limited to 2000 characters and 30 a minute per person. Each person can send 60 invitations and shares a day. Email addresses are only looked up by exact match; there is no member directory.
- **Not included:** message editing, attachments, blocking and moderation tools, and email notifications for ordinary replies (only invitations and shares are emailed).

**Tests:** `pgtest/community_test.py` (50 checks of the Row Level Security rules on real Postgres) and `test/e2e_community.py` (50 browser checks with three users, the real Worker, real PostgREST/Postgres and a fake email service). Real email delivery through Resend has not been tested.

## DALI lighting network

The Equipment tab has a DALI library (Lunatone, OSRAM, LTECH; DIN-rail and remote devices). The DALI tab manages quantities, device names, the DALI line each device connects to, address and bus-current checks, a network schematic and a module layout. Both drawings are in the PDF export; the Excel export adds DALI sheets; the BOM includes the devices. Source file: `designer/dali.js`. Catalogue entries marked Assumed lack a manufacturer figure for DALI current, width or mounting.
