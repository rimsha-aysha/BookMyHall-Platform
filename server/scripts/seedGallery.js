// Seeds neutral demo content for the hall photo galleries and the "Previous
// Events" gallery — for trying the site out, not for a live restaurant.
// Safe to run repeatedly:
//   - gallery entries are matched by title and only created if missing;
//   - demo photos are only added to halls that have fewer than 2 images,
//     and existing images are always kept (new ones are appended).
// Demo photos are placeholder images from picsum.photos (loaded by the
// visitor's browser); replace them with the restaurant's own photos.
//
// Because the demo events are shown publicly as past events, this only runs
// on a database whose name contains "demo", "test" or "dev" unless
// --any-db is given. Run from the server/ folder:
//   npm run seed:gallery
//   npm run seed:gallery -- --any-db
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { getMongoUri } from "../src/config/db.js";
import Hall from "../src/models/Hall.js";
import EventGallery from "../src/models/EventGallery.js";

const photo = (seed) => `https://picsum.photos/seed/${seed}/1200/800`;

// Cycled over the halls that need photos.
const HALL_PHOTO_SETS = [
  ["demo-hall-stage", "demo-hall-tables", "demo-hall-lights", "demo-hall-entrance"],
  ["demo-hall-interior", "demo-hall-decor", "demo-hall-lounge"],
  ["demo-hall-dining", "demo-hall-seating", "demo-hall-evening"],
];

// Generic past events — no real people, families or companies. Each is
// linked to one of the existing halls in turn (or none if there are none).
const GALLERY_ENTRIES = [
  {
    title: "Grand Wedding Reception",
    eventType: "Wedding",
    eventDate: "2026-03-14",
    guestCount: 400,
    description:
      "A 400-guest reception with a floral stage, a warm fairy-light canopy and a five-course dinner. Live photography and valet parking kept the evening running smoothly.",
    photos: ["demo-wedding-stage", "demo-wedding-couple", "demo-wedding-dinner", "demo-wedding-lights", "demo-wedding-guests"],
  },
  {
    title: "Mehndi Night Celebration",
    eventType: "Wedding",
    eventDate: "2026-02-21",
    guestCount: 180,
    description: "A colourful mehndi with traditional décor, a dhol performance and marigold garlands throughout the hall.",
    photos: ["demo-mehndi-decor", "demo-mehndi-dance", "demo-mehndi-colors", "demo-mehndi-table"],
  },
  {
    title: "Kids' Birthday Party",
    eventType: "Birthday",
    eventDate: "2026-05-02",
    guestCount: 60,
    description: "A themed kids' party with balloon arches, a cake table and games for the little ones.",
    photos: ["demo-bday-balloons", "demo-bday-cake", "demo-bday-kids"],
  },
  {
    title: "Annual Corporate Strategy Summit",
    eventType: "Corporate Event",
    eventDate: "2026-06-18",
    guestCount: 55,
    description:
      "A full-day leadership summit with projector setup, breakout sessions, and tea/coffee service between talks.",
    photos: ["demo-summit-keynote", "demo-summit-audience", "demo-summit-networking"],
  },
  {
    title: "Silver Anniversary Dinner",
    eventType: "Anniversary",
    eventDate: "2026-07-09",
    guestCount: 80,
    description: "An intimate dinner under string lights celebrating 25 years together, with a live acoustic set.",
    photos: ["demo-anniv-terrace", "demo-anniv-table", "demo-anniv-cake", "demo-anniv-toast"],
  },
  {
    title: "Engagement Ceremony",
    eventType: "Engagement",
    eventDate: "2026-08-23",
    guestCount: 150,
    description: "A pastel-themed ring ceremony with a floral arch backdrop and a photo corner for guests.",
    photos: ["demo-engage-arch", "demo-engage-rings", "demo-engage-family"],
  },
];

const run = async () => {
  await mongoose.connect(getMongoUri()); // passes the production-database safety guard
  const dbName = mongoose.connection.name;
  if (!/demo|test|dev/i.test(dbName) && !process.argv.includes("--any-db")) {
    throw new Error(
      `Database "${dbName}" doesn't look like a demo/test database, and the demo events would appear on its public site. ` +
        "Re-run with --any-db if you really want demo content there."
    );
  }

  const halls = await Hall.find({}).sort({ createdAt: 1 });

  let hallsUpdated = 0;
  let setIndex = 0;
  for (const hall of halls) {
    if ((hall.images || []).length >= 2) continue;
    const extra = HALL_PHOTO_SETS[setIndex % HALL_PHOTO_SETS.length].map(photo);
    setIndex += 1;
    hall.images = [...(hall.images || []), ...extra.filter((url) => !hall.images.includes(url))];
    await hall.save();
    hallsUpdated += 1;
  }

  let created = 0;
  for (const [i, entry] of GALLERY_ENTRIES.entries()) {
    const exists = await EventGallery.exists({ title: entry.title });
    if (exists) continue;
    await EventGallery.create({
      title: entry.title,
      eventType: entry.eventType,
      hall: halls.length ? halls[i % halls.length]._id : null,
      eventDate: new Date(entry.eventDate),
      guestCount: entry.guestCount,
      description: entry.description,
      images: entry.photos.map(photo),
      isPublished: true,
    });
    created += 1;
  }

  console.log(`Database "${dbName}": halls given demo photos: ${hallsUpdated}. Gallery entries created: ${created}.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Seeding failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
