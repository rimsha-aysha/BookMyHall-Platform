# Installing BookMyHall Platform for a restaurant

A fresh installation shows the default **BookMyHall** branding. Each
restaurant's name, logo, cover photos, colours, contact details and booking
rules are then set — without any code changes — through the setup script
below and/or the Owner's **Admin → Settings** page.

Each restaurant gets its **own, independent installation**: its own database,
backend, frontend, image folder and payment keys. Nothing is shared between
restaurants, and there is no central dashboard — after setup, the
restaurant's Owner manages everything from the restaurant's own admin panel.

This guide is the checklist for one restaurant. Repeat it for each one.

> This release supports restaurants in **India**: prices in INR, Indian mobile
> numbers, Razorpay payments, and the Asia/Kolkata time zone for all booking
> dates and rules (built in — no server time-zone setting needed).

---

## 1. Create the restaurant's resources

Create these **new** for every restaurant. Never reuse another installation's
— and never the original BookMyHall project's — database, keys or secrets.

| Resource | What to create |
|---|---|
| **Database** | A new MongoDB database, e.g. `bookmyhall_spice_garden` (Atlas: ideally its own project/cluster), with a database user that can access **only this database**. |
| **JWT secret** | A long random string, unique to this installation (e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). |
| **Image uploads** | A Cloudinary account (or a shared account with a folder for this restaurant only). Without Cloudinary, uploads are stored on the server's disk — **not suitable for Render**, whose disk is reset on every deploy. |
| **Payments** | Razorpay **test-mode** keys (`rzp_test_…`). Live keys are refused by the code in this release. Eventually each restaurant should use **its own** Razorpay account, so payments go directly to it. |
| **Backend** | A new web service (e.g. Render) connected to this repository. |
| **Frontend** | A new static-site project (e.g. Vercel) connected to this repository. |

## 2. Backend environment variables (`server/`)

Set these in the backend host's dashboard (and in a local `server/.env` when
running the setup script — that file is git-ignored; never commit it).
See `server/.env.example`.

| Variable | Value |
|---|---|
| `NODE_ENV` | **`production`** (required on Render — the server refuses to start there without it). |
| `MONGODB_URI` | This restaurant's connection string, **including the database name** (`…mongodb.net/bookmyhall_spice_garden?…`). |
| `MONGODB_DB_NAME` | The same database name. The server refuses to start if it doesn't match the URI. |
| `MONGODB_BLOCKED_HOSTS` | Optional, comma-separated hosts this installation must never use (e.g. other installations' clusters). Keep real hosts out of Git. |
| `JWT_SECRET` | This installation's own random secret, **at least 32 characters** (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Never reuse it for another restaurant. |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `CLIENT_URL` | This restaurant's website address(es), **https://, no path**. Several are comma-separated, e.g. `https://spicegarden.in,https://www.spicegarden.in` (or the Vercel address). Only these may call the API. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary credentials. **Required in production** — photos saved on Render's own disk would be lost on every deploy. |
| `CLOUDINARY_FOLDER` | This restaurant's own folder, e.g. `bookmyhall-platform/spice-garden`. |
| `ALLOW_LOCAL_UPLOADS` | Leave unset. Only `true` on a host with a **persistent disk**, to store photos there instead of Cloudinary. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay **test** keys (`rzp_test_…`; live keys are refused in this release). Optional — without them, online payment is switched off and offline payments still work. The secret never leaves the server. |

In production the server **refuses to start** — listing every problem — if
`JWT_SECRET`, `CLIENT_URL`, the database settings or Cloudinary are missing or
unsafe. It also hides internal error details from visitors, limits repeated
login/sign-up attempts, sends basic security headers, and turns off the
development-only `/api/test` routes.

The **database safety guard** checks every connection (server and scripts):
the URI must name its database, that name must equal `MONGODB_DB_NAME`, it
may not be the original project's database (`bookmyhall`), and its host may
not be listed in `MONGODB_BLOCKED_HOSTS`.

Render (one web service per restaurant): root directory `server`, build
command `npm ci`, start command `npm start`, health check path `/api/health`.
Node.js 20.19 or newer is required (pinned in `package.json` → `engines`).
Atlas: allow Render's outbound IP addresses (or `0.0.0.0/0` with a strong
database password) in Network Access.

## 3. Frontend environment variables (`client/`)

See `client/.env.example`. These are public (built into the site) — never put
a secret in a `VITE_` variable.

| Variable | Value |
|---|---|
| `VITE_API_URL` | **Required.** The backend URL plus `/api`, e.g. `https://spice-garden-api.onrender.com/api`. A production build fails without it (instead of silently calling `localhost`). |
| `VITE_SITE_TITLE` | Optional: the restaurant's name, used for the browser tab and link previews before the app loads. |
| `VITE_SITE_DESCRIPTION` | Optional: a one-line summary for link previews. |

Vercel (one project per restaurant): root directory `client`, framework Vite
(build `npm run build`, output `dist`). `client/vercel.json` already routes
every path to the app and adds basic security headers. Add the site's final
address(es) to the backend's `CLIENT_URL`.

## 4. Configure the restaurant (one time)

Run this from your own computer, pointed at **this restaurant's** database.
The safest way when you look after several restaurants is one environment
file per restaurant, e.g. `server/setup/spice-garden.env` (files ending in
`.env` in `server/setup/` are git-ignored), containing at least that
restaurant's `MONGODB_URI` and `MONGODB_DB_NAME`, and passing it with
`node --env-file=…` as shown below. Before writing anything, the script shows
the target database and asks you to **type its name to confirm** (`--yes`
skips this for non-interactive use).

1. Copy `server/setup/restaurant.example.json` to e.g.
   `server/setup/spice-garden.json` (files in `server/setup/` other than the
   example are git-ignored) and fill in the restaurant's details, its Owner's
   name and email, and optionally a starting catalog (halls, packages, food,
   decorations, services).
   The `restaurant` section is optional: leave it out (or give only some
   fields) and the site keeps the default **BookMyHall** branding for
   everything not given, to be configured later in Restaurant Settings. The
   smallest valid file is just the Owner:
   `{ "owner": { "name": "…", "email": "…" } }`.
   **Never put a password, secret, token or key in this file** — the script
   refuses such fields.
2. Check it without changing anything:
   ```bash
   cd server
   node --env-file=setup/spice-garden.env scripts/setupRestaurant.js --config setup/spice-garden.json --dry-run
   ```
3. Apply it:
   ```bash
   node --env-file=setup/spice-garden.env scripts/setupRestaurant.js --config setup/spice-garden.json
   ```
   (With `server/.env` instead: `npm run setup:restaurant -- --config setup/spice-garden.json`.)
   For demo past events on a demo installation, `npm run seed:gallery` can be
   run afterwards (demo/test/dev database names only, unless `--any-db`).
   You are asked (twice, hidden) for the new Owner's password — at least 10
   characters. Give it to the Owner securely; they can log in straight away.
   For non-interactive use, `OWNER_PASSWORD` may be set for that one command
   instead (avoid leaving it in shell history).

The setup is validated with the same rules as the admin panel before anything
is written. Once it has completed, running it again is refused, as it is for a
database that already has bookings, unless you pass `--force` — even then the
existing Owner's password is kept and catalog types that already have items
are left alone.

Logo and photos are easiest to add afterwards from the admin panel (the setup
file accepts `https://` image URLs, not local files).

## 5. Hand over to the restaurant

The Owner logs in and, under **Admin → Settings**:

- uploads the logo and cover photos and picks the accent colour;
- checks contact details (phone, WhatsApp, email, address, map link);
- reviews the booking rules — event types (keep "Other" to let customers
  describe their own event), opening hours, minimum notice, maximum days
  ahead and advance percentage — and the policies.

Then, from the admin panel, the Owner adds managers (with their permissions)
and coordinators, and manages halls, menus, packages, decorations, services
and the event gallery.

## 6. Updating installations

All installations run the same code. To release an update, deploy the new
version to each restaurant's backend and frontend; each keeps its own
database and settings.
