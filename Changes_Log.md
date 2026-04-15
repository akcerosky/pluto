# Pluto Changes Log

## 2026-04-11

### Initial Project Setup

- Added the Pluto React/Vite project structure.
- Added core app routes, layout, chat interface, landing page, profile page, auth pages, project modal, mode-specific UI, shared UI components, and styling.
- Added Firebase configuration support and app context for auth, threads, projects, plans, usage limits, and persistence.
- Added subscription and billing configuration, including PhonePe checkout service wiring.
- Added Gemini integration through `src/hooks/useAI.ts`.
- Added project documentation files, package configuration, TypeScript configuration, Vite configuration, and public assets.

### AI Instruction Updates

- Strengthened Pluto's educational-only Gemini system prompt.
- Added adaptive personas for different education levels.
- Added learning-mode behavior for Conversational, Homework, and Exam Prep.
- Added stricter jailbreak resistance, boundary enforcement, and response formatting rules.

## 2026-04-12

### Chat and Auth Behavior

- Added Firebase-backed chat persistence under the signed-in user's app state.
- Fixed refresh behavior so saved conversations remain available after reload.
- Updated login behavior so existing signed-in users are redirected to chat instead of seeing the login form again.
- Changed login flow so users land on a fresh blank chat state after signing in, while older chats remain available in Recent Chats.
- Added cleanup for empty chats so conversations with no messages are removed from localStorage and Firestore sync.

### Routes and Policy Pages

- Added policy pages for Terms & Conditions, Privacy Policy, and Refund and Cancellation Policy.
- Updated policy routes to:
  - `/terms`
  - `/privacy`
  - `/refund`
- Kept footer link titles and policy page titles unchanged.
- Reduced policy page title size.

### Responsive UI

- Refactored the app layout for mobile, tablet, and desktop.
- Added a mobile top bar and sidebar drawer for the logged-in chat app.
- Improved chat header wrapping, message bubble sizing, composer spacing, and empty chat state on small screens.
- Added a mobile landing-page navigation menu.
- Improved responsive behavior for pricing cards, the pricing comparison section, auth pages, profile page, project modal, and policy pages.
- Fixed hero paragraph alignment, mobile Login button styling, and reduced footer height.

### README, Git, and Deployment

- Rewrote the README with local setup, features, tech stack, Firebase configuration, and EC2 deployment notes.
- Added `scripts/deploy-ec2.ps1` to update the EC2 deployment by pulling from GitHub and building on the server.
- Deployed the latest `main` branch to EC2 for `https://pluto.akcero.ai`.

## 2026-04-13

### Secure Backend Migration

- Replaced the old client-trusting billing and AI flow with a Firebase Cloud Functions backend under `functions/`.
- Added callable Functions for: `meGet`,`meUpdateProfile`, `meUsageHistory`, `aiChat`, `billingCheckout`, `billingVerifyPayment`, `billingHistory`, `billingRequestRefund`, `billingSubscriptionGet`, `billingSubscriptionCancel`, `billingSubscriptionResume`, `adminSyncPayment`
- Added Firebase Admin wiring, IST date utilities, Firestore repositories, Razorpay services, request/auth helpers, and Cloud Functions config files.
- Added `firebase.json` Hosting + Functions rewrites and `firestore.rules` for the new server-authoritative data model.

### Billing and Plan Enforcement

- Removed PhonePe from the active code path and deleted `src/services/phonepe.ts`.
- Switched billing to Razorpay-only subscriptions.
- Moved plan authority, quota enforcement, billing state, and Gemini access to the server.
- Updated plan definitions in `src/config/subscription.ts` to:
  - Free: 10/day
  - Plus: INR 299/month, 100/day
  - Pro: INR 599/month, unlimited
- Added server-managed Firestore docs for:
  - `profile/main`
  - `subscriptionPublic/main`
  - `subscriptionPrivate/main`
  - `payments/*`
  - `billingEvents/*`
  - `usageDaily/*`

### Frontend Integration

- Added a callable Functions API client in `src/lib/plutoApi.ts`.
- Updated `src/hooks/useAI.ts` to use the backend instead of direct Gemini access.
- Reworked `src/context/AppContext.tsx` to hydrate plan and usage from server state.
- Split context helpers into:
  - `src/context/appContextTypes.ts`
  - `src/context/appContextValue.ts`
  - `src/context/useApp.ts`
- Updated `src/pages/ProfilePage.tsx` for Razorpay-driven subscription management and billing history.
- Updated `src/config/billing.ts`, `src/lib/firebase.ts`, and `.env.example` for the new Firebase + App Check + Razorpay frontend flow.

## 2026-04-14

### Runtime Fixes and Production Hardening

- Fixed multiple live Firebase Functions issues discovered through deployed logs:
  - removed failing Admin Auth bootstrap lookup for first-user initialization
  - switched runtime service account handling to use the Firebase Admin service account
  - fixed Firestore-backed refund state syncing
  - fixed Gemini history normalization errors
  - fixed oversized chat-history validation failures
  - removed deprecated Gemini model fallback usage
  - improved upstream Gemini error handling for temporary availability issues
- Re-enabled App Check enforcement on callable Functions.
- Added local App Check debug-token support in `src/lib/firebase.ts` for localhost development.

### Billing Lifecycle Improvements

- Verified deployed Razorpay checkout flow in test mode.
- Added clearer resume behavior for Razorpay subscriptions:
  - cancelled subscriptions now return a `failed-precondition` message instead of a generic internal error
  - paused subscriptions remain resumable
- Updated refund persistence so refund state writes to both:
  - `payments/{paymentRecordId}`
  - `subscriptionPrivate/main`
- Improved billing UI messaging so raw callable error strings like `INTERNAL` are replaced with user-friendly messages.

### Auth UX Additions

- Added password-reset flow with `sendPasswordResetEmail` from the login screen.
- Added email verification on signup with `sendEmailVerification`.
- Added an in-app verification banner with resend and refresh actions.
- Added `emailVerified` handling to the user session model and app context.

### Testing and Verification

- Added backend smoke tests for:
  - Gemini history normalization
  - Razorpay webhook/checksum verification
  - plan resolution from webhook billing amounts
- Added a Functions `npm run test` script for the smoke suite.
- Ran and passed:
  - frontend lint
  - frontend build
  - Functions build
  - Functions smoke tests
- Added `scripts/firebase-smoke-test.ps1` for local Firebase verification work.

### UI and State Cleanup

- Updated `src/pages/LandingPage.tsx` so logged-in users are routed toward chat/profile instead of signup CTAs.
- Cleaned Profile page billing behavior and visuals:
  - server-backed billing history state
  - refund-pending button state
  - better renewal action visibility
  - improved resume/cancel button copy and styling
  - cleaned mojibake bullet separators
- Fixed remaining lint issues across shared UI and layout files

### EC2 Deployment

- Added `scripts/deploy-frontend-ec2.sh` for SSH-based frontend deployment to the EC2 host.
- Added a local-only `.env.production` deployment environment file for the EC2 frontend build.
- Pushed the latest `razorpay-backend` branch updates to GitHub so the server could pull the new code.
- Uploaded the production frontend env file to `/var/www/pluto/.env.production` on EC2.
- Deployed the latest frontend build on EC2 by pulling `razorpay-backend`, installing dependencies, building with Vite, validating Nginx config, and reloading Nginx.
- Verified that `https://pluto.akcero.ai` returned HTTP 200 and served the new production asset bundle after deployment.

### Email Verification and Password Reset Action Handling

- Fixed the live `meGet` bootstrap crash by preventing `avatar: undefined` from being written into Firestore profile documents during first-user creation.
- Updated the verify-email polling flow to:
  - reload the current Firebase user repeatedly
  - force an ID token refresh
  - read `emailVerified` from the refreshed `auth.currentUser`
  - redirect immediately to `/chat` once verification is detected
- Reworked auth action code settings to derive redirect URLs from the current browser origin so localhost and production send the user back to the right destination.
- Added a custom auth action handler route at `src/pages/AuthActionPage.tsx` and wired `/__/auth/action` in the React router so EC2-hosted auth links can process Firebase action codes instead of falling through to the landing page.
- Added password reset handling to the auth action page:
  - supports `mode=resetPassword`
  - verifies the reset code
  - shows a new-password form
  - confirms the reset and returns the user to login
- Updated password reset emails to send with explicit action code settings so reset links return to the correct app domain.

### Frontend Auth State Reliability

- Hardened `src/context/AppContext.tsx` so app startup/auth-state refreshes call `firebaseUser.reload()` before trusting cached verification state.
- Updated the in-app verification resend banner to use the same runtime-origin action code settings as signup and verify-email resend flows.
- Added temporary console diagnostics around verification email sending and verification polling to confirm runtime environment and refreshed verification state during debugging.

### EC2 Deployment Reliability

- Fixed the EC2 deployment flow so the server repo remote is reset to the correct GitHub origin before each deploy.
- Redeployed the frontend from the corrected remote after pushing:
  - `08d6a9e` `Fix email verification action flow`
  - `9038554` `Fix password reset action flow`
  - `ad1612f` `Fix EC2 repo remote during deploy`
- Verified the live deployment was updated on EC2 by confirming the server pulled the latest `razorpay-backend` branch and rebuilt the production bundle successfully.

## 2026-04-15

### Token Quota Rollout

- Replaced message-count quota handling with token-based quota accounting for Pluto AI requests.
- Added preflight token estimation, reservation, reconciliation, anomaly fallback, and structured observability for token usage.
- Updated Firestore usage tracking to store token totals, reservations, and derived usage snapshots for the frontend.
- Refreshed plan definitions and frontend quota UI to show token-based usage and compact token formatting.

### Free Mode Trial Access

- Enabled Homework and Exam Prep access for Free users with a combined `3/day` limited trial.
- Added backend enforcement for the Free premium-mode daily cap and surfaced the remaining trial count to the frontend.
- Updated chat entry points and plan copy so Free users can see and use the limited Homework / Exam Prep access before the upgrade prompt appears.

### Hydration and UX Cleanup

- Fixed project sidebar behavior so clicking the active project again clears project focus.
- Stopped the app from briefly showing Free-plan usage for paid users during refresh by waiting for the server subscription snapshot before rendering plan-sensitive UI.
- Improved token usage formatting.

### Validation and Deployment

- Ran and passed: frontend lint, frontend build, Functions build, Functions tests
- Deployed updated Firebase Functions to `pluto-ef61b`.
- Deployed the latest Pluto frontend to EC2 from GitHub commit `89f95a4` on `razorpay-backend`.
