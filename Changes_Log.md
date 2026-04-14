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