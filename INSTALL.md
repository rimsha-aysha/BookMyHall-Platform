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
| `NODE_ENV` | `production` |
| `MONGODB_URI` | This restaurant's connection string, **including the database name** (`…mongodb.net/bookmyhall_spice_garden?…`). |
| `MONGODB_DB_NAME` | The same database name. The server refuses to start if it doesn't match the URI. |
| `MONGODB_BLOCKED_HOSTS` | Optional, comma-separated hosts this installation must never use (e.g. other installations' clusters). Keep real hosts out of Git. |
| `JWT_SECRET` | This installation's own secret. |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `CLIENT_URL` | The frontend's URL, e.g. `https://spice-garden-halls.vercel.app` (CORS). |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary credentials (all three, or none). |
| `CLOUDINARY_FOLDER` | **Required with Cloudinary**: this restaurant's own folder, e.g. `bookmyhall-platform/spice-garden`. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay **test** keys. The secret never leaves the server. |

The **database safety guard** checks every connection (server and scripts):
the URI must name its database, that name must equal `MONGODB_DB_NAME`, it
may not be the original project's database (`bookmyhall`), and its host may
not be listed in `MONGODB_BLOCKED_HOSTS`.

Render: root directory `server`, build command `npm ci`, start command
`npm start`.

## 3. Frontend environment variables (`client/`)

See `client/.env.example`. These are public (built into the site) — never put
a secret in a `VITE_` variable.

| Variable | Value |
|---|---|
| `VITE_API_URL` | The backend URL plus `/api`, e.g. `https://spice-garden-api.onrender.com/api` |
| `VITE_SITE_TITLE` | Optional: the restaurant's name, used for the browser tab and link previews before the app loads. |
| `VITE_SITE_DESCRIPTION` | Optional: a one-line summary for link previews. |

Vercel: root directory `client`, framework Vite (build `npm run build`, output
`dist`). `client/vercel.json` already routes every path to the app.

## 4. Configure the restaurant (one time)

Run this from your own computer, with `server/.env` pointing at **this
restaurant's** database.

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
   npm run setup:restaurant -- --config setup/spice-garden.json --dry-run
   ```
3. Apply it:
   ```bash
   npm run setup:restaurant -- --config setup/spice-garden.json
   ```
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
