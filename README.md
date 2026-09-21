# Kirana

Kirana is a single full-stack Next.js marketplace for customers, shopkeepers, and administrators.

## Architecture

```text
Next.js routes and server components
  -> custom JWT authentication and authorization
  -> Mongoose models
  -> MongoDB
```

- **Database:** MongoDB with Mongoose.
- **Authentication:** Email/password and direct Google OAuth. User accounts and roles are stored in MongoDB.
- **Maps:** Google Maps JavaScript API, Places API, and browser geolocation.
- **Realtime refresh:** Client polling through the application API.

There is no PostgreSQL, Supabase Database, Supabase Auth, Supabase Storage, or Supabase Realtime dependency in the current application.

## Requirements

- Node.js 22 or later
- npm
- A MongoDB instance
- A Google Maps API key for map and Places features
- A Google OAuth web client for Google sign-in

## Setup

Install dependencies:

```powershell
npm.cmd install
```

Create `.env.local` in the repository root:

```env
MONGODB_URI=mongodb://localhost:27017/kirana
JWT_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_PLACES_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SEED_PASSWORD=
```

Never commit `.env.local` or expose OAuth client secrets.

For local Google sign-in, configure this exact authorized redirect URI in the OAuth client:

```text
http://localhost:3000/auth/callback
```

## Run

```powershell
npm.cmd run dev
```

Open `http://localhost:3000`.

To create MongoDB demo data:

```powershell
npm.cmd run seed
```

## Quality checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Browser coverage is available through Playwright:

```powershell
npx.cmd playwright test
```

## Security boundaries

- MongoDB is accessed only on the server through Mongoose.
- `MONGODB_URI`, JWT secrets, and Google client secrets must never be exposed to browser code.
- API and server-route authorization enforce customer, shopkeeper, and administrator roles.
- Google Maps browser keys should be restricted to approved HTTP referrers and Maps/Places APIs.
