# BookMyHall Platform

Hall and event booking software for restaurants, installed **independently for
each restaurant**: one installation = one restaurant, with its own database,
branding, staff accounts and payment keys. It is not a marketplace or a
multi-tenant system.

Built on the BookMyHall booking system (MERN: React, Node.js/Express,
MongoDB/Mongoose, Cloudinary, Razorpay test mode), extended so each
installation can be configured for its restaurant:

- restaurant name, logo, description, cover photos, accent colour
- contact details: phone, WhatsApp, email, address, map link
- halls, menus, packages, decorations and services — all with photos
- booking rules: event types, opening hours, minimum notice, maximum days
  ahead, advance percentage, booking and cancellation policies
- a restaurant-branded customer website and admin panel

Everything from BookMyHall is kept: online and walk-in bookings, live
availability, smart suggestions, Razorpay and offline payments, roles and
manager permissions, coordinator tasks and issues, reviews, the event gallery
and reports.

## Layout

```
client/   React + Vite frontend (customer site and admin panel)
server/   Express API, Mongoose models, scripts and tests
  scripts/setupRestaurant.js   one-time setup of an installation
  setup/restaurant.example.json
INSTALL.md   checklist for installing for a restaurant
```

## Local development

Needs Node.js 20.19+ (or 22.12+) and a MongoDB you control (local, or a development
database — never a restaurant's live one).

```bash
cd server
cp .env.example .env    # then edit: local MONGODB_URI, MONGODB_DB_NAME, JWT_SECRET
npm ci
npm run setup:restaurant -- --config setup/restaurant.example.json   # sample restaurant + Owner
npm run seed:gallery     # optional: demo photos and past events (demo/test/dev databases only)
npm run dev
```

```bash
cd client
cp .env.example .env.local
npm ci
npm run dev
```

A fresh installation shows the default **BookMyHall** branding; the setup
file's `restaurant` section is optional, so an Owner-only file keeps it until
the restaurant is configured in Admin → Settings.

## Tests

```bash
cd server
npm test
```

The tests use an in-memory MongoDB and stubbed Razorpay calls; they never
contact a real database, Cloudinary or Razorpay.

## Safety

- `server/.env` and per-restaurant setup files are git-ignored; never commit
  credentials.
- A database guard (`server/src/config/dbGuard.js`) refuses any connection
  whose database doesn't match `MONGODB_DB_NAME`, or that belongs to the
  original BookMyHall project.
- Razorpay is restricted to test mode in this release.
