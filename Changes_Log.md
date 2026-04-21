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

## 2026-04-16

### Transactional Billing Email Delivery

- Added Resend-based transactional email support to Firebase Functions.
- Extended Functions env/config setup to include:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
- Added a shared email sender helper in `functions/src/services/email.ts` that:
  - initializes the Resend client lazily
  - logs failures without crashing the caller
  - returns delivery success/failure so callers can avoid false-positive state updates
- Added reusable HTML billing email templates in `functions/src/services/emailTemplates.ts` for:
  - subscription activation
  - renewal charge confirmation
  - cancellation confirmation
  - pause notification
  - subscription expiry
  - refund request confirmation
- Wired Razorpay webhook-driven emails into `functions/src/handlers/http.ts` for:
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.cancelled`
  - `subscription.paused`
- Wired refund confirmation email sending into `billingRequestRefund` in `functions/src/handlers/billing.ts`.
- Added contact lookup fallback in `functions/src/services/firestoreRepo.ts` so billing emails try `subscriptionPrivate/main` first and then `profile/main`.
- Documented Resend setup and transactional email env requirements in `README.md`.

### Activation Email Reliability

- Added a checkout-verification fallback in `billingVerifyPayment` so successful first-time subscription activation can send the Pluto activation email immediately, instead of depending only on webhook timing.
- Added payment-record metadata tracking for `activationEmailSent` to avoid duplicate activation emails between checkout verification and later webhook processing.
- Updated the webhook path to honor the activation-email flag before sending `subscription.activated` emails.

## 2026-04-18

### Localhost App Check Stability

- Updated `src/lib/firebase.ts` so local development can use a fixed App Check debug token from env instead of generating a new token repeatedly.
- Added `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN` to the local `.env` flow and switched the localhost debug token to a fixed UUID value for easier Firebase App Check registration.

### Live Razorpay Rollout

- Updated local production env values to use the live Razorpay public key in: `.env.production`, `.env`
- Updated `functions/.env` to use live Razorpay backend values: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLUS_PLAN_ID`, `RAZORPAY_PRO_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET`
- Deployed Firebase Functions to `pluto-ef61b` with the live Razorpay backend configuration.

## 2026-04-20

### Multimodal Attachments

- Migrated Pluto's Gemini integration from `@google/generative-ai` to `@google/genai` in both the app and Functions packages.
- Added inline multimodal attachment support to chat with plan-based limits:
  - `Free`: no attachments
  - `Plus`: images only, up to 5 MB per file
  - `Pro`: images and PDFs, up to 20 MB per file
- Updated Pluto's message model from plain `content` strings to structured `parts`, while preserving backward compatibility for existing saved chats.
- Added composer attachment UX in the chat interface with file picker support, mobile camera capture support, attachment preview chips before send, metadata chips persisted in chat history after send
- Implemented inline base64 attachment sending for the current turn only, without storing file contents in thread state, `appState/main`, or Firestore.
- Added frontend and backend request-size guards so prompt + attachment payloads stay under the 8 MB callable safety limit.
- Added backend MIME-type, size, and base64 validation before sending multimodal parts to Gemini.
- Verified attachment-aware chat behavior with successful local app and Functions builds plus Functions tests.
- Deployed the updated Firebase Functions to `pluto-ef61b` and rolled the latest frontend to EC2 from GitHub before the later mode-behavior refinement work.

### Mode Behavior Refinement

- Updated Pluto mode behavior in `functions/src/services/gemini.ts` using the AlphaBuddy `useAI.py` prompt contract as reference.
- Strengthened `Conversational` mode to guide students with more Socratic, step-by-step reasoning instead of jumping straight to answers.
- Tightened `Homework` mode so responses focus on approach, next-step scaffolding, and short hints instead of full solutions.
- Refocused `ExamPrep` mode toward quizzes, mock-test style practice, revision prompts, and exam strategy.
- Added a Pluto-adapted off-topic refusal rule for clearly non-educational requests.
- Added lightweight response cleanup to normalize empty outputs, trim filler openers, collapse spacing, and clean common math/LaTeX artifacts.
- Updated mode helper panels and quick-action prompts in the chat UI so the frontend reflects the new backend tutoring behavior.

### Retry UX and Mobile Chat Polish

- Added richer `aiChat` request logging in the browser with request IDs, retry attempts, retry success, and exhausted-retry reporting to make transient provider failures easier to trace.
- Added automatic client retries for retryable `aiChat` callable failures, while keeping final error bubbles hidden until all retries are exhausted.
- Increased backend Gemini retry spacing to give transient `503` and `429` provider failures more time to recover.
- Added inline retry status in chat so active user prompts can show `Sending...` or `Retrying X/Y...` directly under the message.
- Added a retry action on failed user prompts and changed retry behavior so retrying removes the old assistant error bubble instead of stacking duplicate failure messages.
- Refined chat footer behavior on mobile by improving the helper panel layering, moving the composer slightly lower while the helper panel is open, and keeping the prompt area easier to read.
- Tuned the mobile composer placeholder styling so its text scales down on smaller screens while staying normal on wider layouts.

## 2026-04-21

### Rolling Chat Memory and Gemini Context

- Replaced plan-specific Gemini history caps with rolling per-thread `contextSummary` memory plus a shared latest-16-message window for all plans.
- Added backend summary candidate validation, summary refresh support, deterministic fallback summaries, and summary-aware token estimation.
- Persisted `contextSummary` in thread/app state while keeping attachment bytes excluded from thread state and Firestore.
- Added summary injection guidance so prior refused/off-topic requests are treated as already handled and do not cause legitimate meta questions like “what did I say earlier?” to be over-refused.

### Chat Reliability and Function Performance

- Increased the `aiChat` callable timeout to 120 seconds for larger Gemini/PDF workloads.
- Reduced server-side Gemini retry backoff to cap retry waiting around 5 seconds instead of the previous long retry schedule.
- Removed an extra post-response `getMeSnapshot` read by returning usage values from reconciliation results.
- Updated system prompt token overhead estimates to better match the larger tutoring prompt.
- Lazy-loaded billing/webhook-only dependencies so `aiChat` cold starts avoid loading Razorpay/Resend paths unnecessarily.
- Updated `firebase-functions` in the Functions package and confirmed the Functions build still passes.

### Frontend Polish and Bundle Size

- Fixed sidebar recent-chat navigation after visiting Settings by routing recent-chat clicks back to `/chat`.
- Reworked sidebar daily reset UX to use a single info button beside the usage text, with the IST reset time shown inline only on hover/click.
- Aligned the mobile sidebar New Chat and close controls on one row.
- Wrapped frontend debug/info logs so they only emit when `VITE_APP_ENV === 'development'`, while keeping error logs unconditional.
- Added route-based React `lazy` and `Suspense` splitting for page-level routes, reducing the largest production JS chunk below 500 KB.

### Verification and Deployment

- Ran and passed root lint, root production build, Functions TypeScript build, and the Functions test suite.
- Committed and pushed the verified changes to GitHub on `main` as commit `0ddc557`.
- Deployed Firebase Functions to `pluto-ef61b`, including the updated `aiChat` function in `asia-south1`.
- Deployed the latest frontend to EC2 from GitHub using `scripts/deploy-frontend-ec2.sh`, built successfully on the server, and reloaded Nginx for `https://pluto.akcero.ai`.
