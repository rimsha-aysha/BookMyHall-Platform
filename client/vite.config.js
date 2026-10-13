import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Title and description written into index.html at build time, so the tab
// title and link previews are right before any JavaScript runs. Each
// installation sets its own VITE_SITE_TITLE / VITE_SITE_DESCRIPTION; the app
// then refines the title from the restaurant's settings at runtime.
const DEFAULT_TITLE = 'BookMyHall — Halls & Event Booking'
const DEFAULT_DESCRIPTION = 'Book halls and plan events — venues, packages, food, décor and live availability.'

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const title = escapeHtml(env.VITE_SITE_TITLE?.trim() || DEFAULT_TITLE)
  const description = escapeHtml(env.VITE_SITE_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION)

  return {
    plugins: [
      react(),
      {
        name: 'site-meta',
        transformIndexHtml: (html) =>
          html.replaceAll('__SITE_TITLE__', title).replaceAll('__SITE_DESCRIPTION__', description),
      },
    ],
  }
})
