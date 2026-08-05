# Kentexa Early Access Portal

A pre-launch registration site for Kentexa, a Tanzanian marketplace. Businesses,
sellers, service providers, transporters, and agents can register for early
access; admins (Admin/Manager roles on the main Kentexa backend) can review,
approve, reject, and export registrations.

This is a standalone Next.js 14 (App Router) app with its own `package.json`,
independent from `bishoo-frontend/` (the existing CRA app) and `src/` (the
existing NestJS backend). It talks to the backend's `early-access` module and
the main backend's `/auth/login` endpoint over HTTP.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark mode via the `class` strategy, toggle persisted to `localStorage`)
- `react-hook-form` + `zod` for the multi-step registration form
- `recharts` for the admin dashboard charts
- `react-hot-toast` for all success/error feedback
- Plain `fetch` for API calls — no axios, no UI component library

## Getting started

```bash
cd kentexa-early-access
npm install
cp .env.local.example .env.local   # then adjust NEXT_PUBLIC_API_URL if needed
npm run dev
```

The dev server runs on **port 3002** (`next dev -p 3002`) so it doesn't clash
with `bishoo-frontend`'s CRA dev server on port 3000.

```bash
npm run build   # production build
npm run start   # serve the production build on port 3002
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Base URL of the backend that serves `/early-access/*` and `/auth/login` |

## Pages

- `/` — landing page with hero, benefits, live stats counters, and CTA
- `/register` — 7-step registration form (account type → business info →
  location → online presence → media uploads → quick AI-research questions →
  review & submit)
- `/success/[id]` — confirmation page showing the generated `KTX-EA-000123` ID
- `/admin/login` — admin sign-in (calls the main backend's `/auth/login`)
- `/admin` — stats overview with 4 charts (registrations/day, by region, by
  category, account type distribution)
- `/admin/registrations` — filterable, paginated table with approve / reject /
  delete / view actions and CSV/Excel export
- `/admin/registrations/[id]` — full registration detail with an image
  gallery, approve/reject/delete actions

## Notes / things to verify against the real running backend

- The `/auth/login` response shape was confirmed directly from the backend
  source (`src/auth/auth.service.ts`): `{ access_token: string, user: { id,
  phone, email, name, role, onboardingCompleted } }`. The login flow reads
  `access_token` and stores it under the `kentexa_ea_admin_token` localStorage
  key. It also logs the raw response to the console on every login attempt
  during development, in case the deployed backend ever diverges from this.
- Only users whose `user.role` is `admin` or `manager` (case-insensitive) are
  treated as authorized on the client; the backend's own 403 response on
  `GET /early-access/admin` is still the source of truth — the UI surfaces a
  clear "Not authorized" message when that happens.
- The map/location step uses plain latitude/longitude number inputs rather
  than a real map picker SDK (Google Maps/Mapbox), per the spec — this was
  explicitly called out as optional. See the comment in
  `components/form/StepLocation.tsx` for where a real picker could go.
- CSV/Excel export is implemented as an authenticated `fetch` → `Blob` →
  temporary `<a download>` click, since a plain `<a href>` can't send the
  `Authorization` header.
