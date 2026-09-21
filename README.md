# Cospharm Operations Intelligence Platform

COIP is a TanStack Start operations dashboard with inventory, delivery, task, marketer, regulatory, HR, calendar, and audit workflows.

## Local setup

1. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.
2. Install dependencies with `pnpm install`.
3. Run `pnpm inventory:seed` to idempotently load the prepared inventory data.
4. Start the app with `pnpm dev`.

The inventory seed contains 199 products and 1,160 monthly movement rows. Excel imports always open a read-only preview first. The preview classifies product rows as new, changed, unchanged, or conflicting; only new and changed rows are written when the user confirms the sync.

## Deployment

The production build targets Vercel. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project, then run `pnpm build` or deploy through the connected GitHub repository.

The database schema is versioned in `supabase/migrations` and does not depend on Lovable.
