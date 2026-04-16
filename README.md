# Pluto

Pluto is an AI tutoring app built with React, Firebase, Gemini, and Razorpay. The frontend keeps chat threads and project organization in Firestore, while billing, usage enforcement, and AI access are handled by Firebase Cloud Functions.

## Architecture

- `src/` - Vite + React frontend
- `functions/` - Firebase Cloud Functions (2nd gen, Node 22, TypeScript)
- `firestore.rules` - Firestore security rules
- `firebase.json` - Functions, Firestore, and Hosting config

Core decisions in the current stack:

- Razorpay is the only billing provider
- Gemini calls are server-side only
- plan authority and daily quota enforcement are server-side
- callable Functions require Firebase Auth and App Check
- webhook handling stays on HTTP Functions with Razorpay signature verification
- all daily usage resets at `00:00 IST`

## Plans

- Free - 10 AI requests/day
- Plus - INR 299/month, 100 AI requests/day
- Pro - INR 599/month, unlimited AI requests/day

Usage is stored in Firestore as:

```text
users/{uid}/usageDaily/YYYY-MM-DD-IST
```

## Features Implemented

- Email/password login
- Google sign-in
- Password reset from the login page
- Email verification after signup
- In-app email verification banner with resend + refresh
- Razorpay subscription checkout
- Razorpay webhook activation sync
- Cancel renewal
- Resume renewal for paused subscriptions
- Refund request flow
- Server-side plan enforcement for chat

## Firestore Model

Client-managed:

```text
users/{uid}/appState/main
```

Server-managed:

```text
users/{uid}/profile/main
users/{uid}/subscriptionPublic/main
users/{uid}/subscriptionPrivate/main
users/{uid}/payments/{paymentRecordId}
users/{uid}/billingEvents/{providerEventId}
users/{uid}/usageDaily/{YYYY-MM-DD-IST}
```

## Frontend Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
copy .env.example .env
```

3. Fill in the frontend env vars:

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

Notes:

- `VITE_RAZORPAY_KEY_ID` is the public Razorpay key used by Checkout
- `VITE_API_BASE_URL` can stay empty when using Firebase Hosting + callable Functions
- localhost development supports Firebase App Check debug token flow

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

2. Create `functions/.env` from `functions/.env.example`

3. Fill in the required secrets/config:

```env
GOOGLE_GEMINI_API_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLUS_PLAN_ID=...
RAZORPAY_PRO_PLAN_ID=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL="Pluto <hello@yourdomain.com>"
LOG_LEVEL=info
FIREBASE_PROJECT_ID=pluto-ef61b
```

4. Configure Resend for transactional billing emails:

- `RESEND_API_KEY` is the Resend API key used by Cloud Functions
- `RESEND_FROM_EMAIL` is the verified sender used for subscription and refund notifications

5. Add the Firebase Functions secrets for transactional email:

```bash
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set RESEND_FROM_EMAIL
```

These secrets are bound to the callable Functions and Razorpay webhook at deploy time, and local development can still read the same keys from `functions/.env`.

6. Build Functions:

```bash
npm run build
```

7. Run the current smoke tests:

```bash
npm run test
```

## Firebase Console Requirements

Enable:

- Authentication
- Firestore Database
- App Check
- Cloud Functions
- Hosting (recommended)

Auth providers currently used:

- Email/Password
- Google

App Check:

- Production uses reCAPTCHA v3
- Local development can use an App Check debug token

## Admin Bootstrap

Grant admin access with Firebase custom claims:

```bash
cd functions
npx tsx src/scripts/setAdminClaims.ts --email admin@example.com
```

This sets:

```json
{ "admin": true }
```

on the chosen Firebase user.

## Local Verification Commands

Frontend:

```bash
npm run lint
npm run build
```

Functions:

```bash
cd functions
npm run build
npm run test
```

Emulators:

```bash
cd functions
npm run serve
```

## Deployment

Deploy Functions and Firestore rules:

```bash
firebase deploy --only functions,firestore:rules
```

Deploy Hosting too:

```bash
npm run build
firebase deploy --only hosting,functions,firestore:rules
```

Production/runtime notes:

- region: `asia-south1`
- `aiChat` and billing callables use `minInstances = 1`
- webhook URL is exposed through the `razorpayWebhook` Function
- App Check is enabled on all callable Functions

## Razorpay Notes

Implemented server flows:

- subscription checkout
- checkout verification
- webhook activation/renewal/cancellation/pause sync
- cancel renewal
- resume paused subscriptions
- refund request with usage-based eligibility checks

Important behavior:

- cancelled subscriptions cannot be resumed through Razorpay
- paused subscriptions can be resumed
- refund state is mirrored into both:
  - payment records
  - `subscriptionPrivate/main`

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

All sensitive writes happen through Firebase Admin SDK in Cloud Functions.

## Current Limitations / Follow-Ups

- Account deletion is not implemented yet
- Bundle size is still large and should be code-split before a polished production launch
- Local Node is expected to be upgraded to `20.19+` or `22.12+` for Vite parity
- `firebase-functions` in `functions/package.json` is behind latest and should be upgraded carefully

## Notes

- The old client-side Gemini key flow is removed
- PhonePe has been removed from the active billing architecture
- The old `backend/` and `deploy/` folders are not part of the active runtime architecture
