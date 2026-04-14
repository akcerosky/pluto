# Pluto

Pluto is an AI-powered learning companion built with React, Firebase, and Gemini. The frontend keeps chat threads and project organization in Firestore, while paid plans, usage accounting, and AI access now route through Firebase Cloud Functions.

## What Changed

- Gemini API access moved off the client and into Firebase Cloud Functions
- Billing is now Razorpay-only using Razorpay Subscriptions
- Plan authority and daily quota enforcement are server-side
- Firebase App Check protects callable functions from non-app clients
- Firestore rules now block client writes to subscription and payment state

## Plans

- Free: 10 messages/day
- Plus: INR 299/month, 100 messages/day
- Pro: INR 599/month, unlimited messages/day

All daily limits reset at **00:00 IST** and are stored in Firestore as `usageDaily/YYYY-MM-DD-IST`.

## Repo Layout

```text
src/          React frontend
functions/    Firebase Cloud Functions (2nd gen)
firestore.rules
firebase.json
```

## Frontend Setup

1. Install root dependencies:

```bash
npm install
```

2. Create `.env` from the example:

```bash
copy .env.example .env
```

3. Required frontend env vars:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_APP_CHECK_SITE_KEY=...
VITE_FIREBASE_FUNCTIONS_REGION=asia-south1
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxx
VITE_API_BASE_URL=
VITE_APP_ENV=development
```

4. Run the frontend:

```bash
npm run dev
```

## Functions Setup

1. Install Functions dependencies:

```bash
cd functions
npm install
```

2. Create `functions/.env` from `functions/.env.example`.

3. Required Functions env vars:

```env
GOOGLE_GEMINI_API_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLUS_PLAN_ID=...
RAZORPAY_PRO_PLAN_ID=...
LOG_LEVEL=info
```

4. Build functions:

```bash
npm run build
```

## Firebase Requirements

Enable:

- Authentication
- Firestore Database
- App Check
- Cloud Functions
- Hosting (optional but recommended)

Authentication providers:

- Email/Password
- Google

## Admin Bootstrap

Grant admin access with a Firebase custom claim:

```bash
cd functions
npx tsx src/scripts/setAdminClaims.ts --email admin@example.com
```

This sets `{ admin: true }` on the target Firebase user.

## Deployment

Deploy Firestore rules and Functions:

```bash
firebase deploy --only firestore:rules,functions
```

Deploy Hosting too if you want Firebase Hosting to serve the Vite build:

```bash
npm run build
firebase deploy --only hosting,functions,firestore:rules
```

Recommended production region: `asia-south1`.

Warm instances:

- `aiChat`
- billing callables

are configured with `minInstances = 1` to reduce cold starts on paid flows.

## Firestore Security Model

Clients can:

- read/write only their own `users/{uid}/appState/**`
- read only their own `users/{uid}/profile/**`
- read only their own `users/{uid}/subscriptionPublic/**`

Clients cannot write:

- `profile/**`
- `subscriptionPublic/**`
- `subscriptionPrivate/**`
- `usageDaily/**`
- `payments/**`
- `billingEvents/**`

## Notes

- The old client-side Gemini API key flow has been removed.
- Cloud Functions use the default Firebase service account automatically.
- The previously created `backend/` and `deploy/` folders are vestigial from an interrupted migration and are not part of the active architecture.
