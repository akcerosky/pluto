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

## 2026-04-22

### aiChat Request Safety and Reliability

- Added Firestore-backed `aiRequestCache` request deduplication so repeated callable attempts with the same request ID do not start duplicate Gemini calls or double-reserve quota.
- Added Firestore-backed per-user `aiRateLimits` with a 20 requests/minute guard and structured logging for rate-limit hits.
- Added Firestore-backed Gemini 503 spike monitoring with affected-user tracking for 5-minute overload windows.
- Updated request cache completion writes so `contextSummary` is stored as `null` instead of `undefined`, and cache completion failures are now logged instead of silently swallowed.
- Removed frontend auto-retry for backend `functions/unavailable` responses so server-side Gemini retries remain the only automatic provider-overload retry path; manual Retry Request remains available.

### Gemini Fallbacks, Tokens, and Context Trimming

- Added `gemini-2.5-flash-lite` as a fallback model after `gemini-2.5-flash` for retryable provider failures.
- Changed Gemini retry behavior to two attempts with a longer 20-second delay before the second attempt, reducing rapid retry pressure during provider overload spikes.
- Updated mode output budgets to `Conversational: 4000`, `Homework: 4000`, and `ExamPrep: 2500`, still clamped by each plan's max output token cap.
- Added AlphaBuddy-style dynamic recent-history trimming so Gemini receives at most a 4000-token recent-history budget while preserving a minimum recent context window.
- Added structured input-context logging on every request, including sent history count, trimmed history count, prompt/history/summary token estimates, attachments, summary candidates, and context summary state.
- Fixed the IST daily usage reset bug by removing double timezone conversion in the backend day-key helper.
- Checked `aiRequestCache`, usage documents, and runtime logs for specific request IDs to distinguish real Gemini provider overload from Pluto-side cache/write/retry issues.
- added `gemini-2.5-flash-lite` as the fallback model to improve availability during `gemini-2.5-flash` high-demand windows.
- Reviewed retry behavior end-to-end and removed frontend retry multiplication after confirming server-side retries were already handling provider retry attempts.

## 2026-04-23

### Chat Stability and Provider Fallback Refinement

- Refined the Gemini fallback path in `functions/src/services/gemini.ts` and the compiled Functions output so provider overload handling is more predictable and testable.
- Added a dedicated fallback test in `functions/src/services/geminiModelFallback.test.ts` to verify fallback behavior and model reporting.
- Updated retry-policy coverage in `functions/src/services/geminiRetryPolicy.test.ts`.
- Kept the aiChat request path lightweight with small handler updates in `functions/src/handlers/ai.ts` and `functions/lib/handlers/ai.js`.

### Secrets and Environment Cleanup

- Added centralized secrets config files in `functions/src/config/secrets.ts` and `functions/lib/config/secrets.js`.
- Updated function environment/config loading in `functions/src/config/env.ts` and `functions/lib/config/env.js`.
- Adjusted `functions/src/index.ts` and `functions/lib/index.js` to use the updated config wiring.
- Updated `functions/package.json`, `firebase.json`, and related repo config to support the current deployment/runtime setup.

### Frontend Resilience and App Shell Cleanup

- Added a reusable frontend error boundary in `src/components/ErrorBoundary.tsx` and wired the app through `src/App.tsx`.
- Simplified layout/page wiring across `src/components/Layout/MainLayout.tsx`, `src/components/Layout/Sidebar.tsx`, `src/pages/AuthPages.tsx`, and `src/pages/VerifyEmailPage.tsx`.
- Updated `src/lib/plutoApi.ts` to align the client request path with the current backend retry/fallback behavior.
- Added small repo hygiene updates in `.gitignore`, `README.md`, and `eslint.config.js`.

### Nova Hybrid Routing Rollout

- Added deterministic AI provider routing so attachment requests go to Gemini and text-only requests go to Nova Micro.
- Introduced provider-isolated AI orchestration under `functions/src/services/ai/` and the compiled `functions/lib/services/ai/` output.
- Added Nova retry and terminal Gemini fallback coverage in `functions/src/services/ai/orchestrator.test.ts` and routing coverage in `functions/src/services/ai/router.test.ts`.
- Refactored the Gemini path into a single-attempt provider executor and updated client response typing in `src/lib/plutoApi.ts`.
- Added Bedrock secret/config support in `functions/src/config/secrets.ts`, `functions/src/config/env.ts`, and `functions/.env.example`.
- Fixed the Nova provider endpoint to use the correct AWS Bedrock runtime hostname and switched the default Bedrock path to `BEDROCK_REGION=ap-south-1` with `BEDROCK_NOVA_MICRO_MODEL_ID=apac.amazon.nova-micro-v1:0`.

## 2026-04-24

### Gemini Reliability and Audit Tooling

- Added a retryable Gemini model fallback in `functions/src/services/gemini.ts` so attachment requests start on `gemini-2.5-flash` and only fall back to `gemini-2.5-flash-lite` for retryable Gemini failures.
- Kept Nova Micro as the primary text-only path while preserving provider isolation and clearer attempt metadata in `functions/src/services/ai/orchestrator.ts`, `functions/src/services/ai/providerTypes.ts`, and the compiled `functions/lib/services/ai/` output.
- Improved summary handling and memory injection safety in `functions/src/services/ai/prompting.ts`, `functions/src/services/ai/providers/novaMicroProvider.ts`, and `src/components/Chat/ChatInterface.tsx`.
- Added and updated coverage in `functions/src/services/geminiModelFallback.test.ts` and `functions/src/services/ai/orchestrator.test.ts`.
- Added `scripts/auditAiChat.mjs` and generalized `scripts/auditAiChatDay.mjs` to audit Cloud Logging and Firestore request windows with refreshed Google OAuth access tokens from the local Firebase CLI login.

## 2026-04-25

### Firestore Chat Storage Migration

- Migrated Pluto chat persistence from a single large `users/{uid}/appState/main` document to collection-backed storage under `users/{uid}/threads/{threadId}`, `users/{uid}/threads/{threadId}/messages/{messageId}`, `users/{uid}/projects/{projectId}`, and `users/{uid}/meta/migration`.
- Added new frontend chat store hooks and serializers in `src/hooks/useThreads.ts`, `src/hooks/useMessages.ts`, `src/hooks/useProjects.ts`, and `src/lib/chatStore.ts`, while keeping the `AppContext` public API stable.
- Updated `src/context/AppContext.tsx` to use lightweight `appState/main` sync metadata, persist `contextSummary` on thread metadata, page active-thread messages, and clean up empty local drafts instead of persisting them immediately.
- Added the callable `deleteThread` handler in `functions/src/handlers/chatState.ts` and exported it from `functions/src/index.ts` so thread metadata and message subcollections can be removed safely from the backend.
- Added the admin backfill script `functions/src/scripts/migrateChatData.ts` and corresponding compiled output, plus Firebase Admin bootstrap support for local refresh-token-backed script execution in `functions/src/lib/firebaseAdmin.ts`.
- Updated `firestore.rules`, `src/lib/plutoApi.ts`, `src/components/Chat/ChatInterface.tsx`, `src/context/appContextTypes.ts`, and `src/types/index.ts` to support the new storage model and message-loading behavior.

### Migration and Sidebar Cleanup

- Deployed updated Firestore rules to `pluto-ef61b` and migrated the original user `EahOcjp4slbT6nj8YtgNktOySkD2`, reducing `appState/main` to lightweight metadata only.
- Fixed the bulk migration scanner so it discovers users from legacy `appState/main` documents, then migrated the remaining legacy users with the backfill script.
- Fixed several chat-state race conditions in `src/context/AppContext.tsx` so active empty drafts are not bounced back to the welcome screen while stale empty chats and deleted threads no longer linger in the sidebar.
- Added automatic cleanup for old empty cloud thread docs by filtering `messageCount: 0` thread metadata from the UI and deleting stale empty thread records in the background.

## 2026-04-27

### AI Persistence, Safety, and Observability

- Hardened Nova prompt handling and response validation in `functions/src/services/ai/prompting.ts` and `functions/src/services/ai/providers/novaMicroProvider.ts` to reduce internal memory-context leakage and added regression coverage in `functions/src/services/ai/providers/novaMicroProvider.test.ts`.
- Moved assistant reply persistence into the `aiChat` Function in `functions/src/handlers/ai.ts`, updating `functions/src/types/index.ts`, `src/hooks/useAI.ts`, `src/lib/plutoApi.ts`, and `src/context/AppContext.tsx` so assistant messages are written server-side before success is returned.
- Added structured frontend runtime logging in `src/lib/runtimeLogger.ts`, Sentry bootstrap in `src/instrument.ts` / `src/main.tsx`, and production-safe error handling updates across auth, profile, layout, and chat surfaces.

### Chat Storage, Smoke Coverage, and UI Polish

- Added backend smoke helpers and coverage for delete-thread cleanup, Nova fallback, and billing email paths in `functions/src/scripts/`, `functions/src/handlers/chatState.test.ts`, and the compiled `functions/lib/` output.
- Added browser smoke scaffolding in `playwright.config.ts` and `smoke/` plus UI test hooks in `src/components/Layout/Sidebar.tsx` and `src/components/Chat/ChatInterface.tsx`.
- Improved frontend chat rendering with lazy mode panels, lazy assistant content, cookie consent, duplicate-message dedupe, better mobile bubble spacing, and KaTeX / markdown rendering fixes across `src/components/Chat/AssistantMessageContent.tsx`, `src/components/Chat/LazyModePanels.tsx`, `src/components/CookieConsentBanner.tsx`, `src/components/Chat/ChatInterface.tsx`, and `src/index.css`.
- Hid the Discover tab in production while keeping it available in development via `src/components/Layout/Sidebar.tsx`.

## 2026-04-28

### Audit Fixes and Release Hardening

- Added the production Sentry DSN to the local deployment env flow in `.env.production` and pushed the updated frontend env to EC2 during deployment.
- Kept Sentry browser loading production-only while moving heavy Sentry runtime code out of the main app bundle.
- Added Firestore collection-group single-field index configuration for `subscriptionPublic.status` in `firestore.indexes.json` and wired it through `firebase.json`.
- Updated billing cancellation behavior so `cancelAtPeriodEnd: true` keeps the public subscription status `active` until the actual end-of-period cancellation event.
- Tightened Privacy Policy wording so attachment handling now accurately states that file contents are sent directly to the AI provider and only attachment metadata is retained in chat history.
- Documented that `RAZORPAY_KEY_ID` is intentionally public and added a production warning for `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN` in `.env.example`.

### Frontend Performance and Verification Handoff

- Split markdown/math rendering and runtime logging further so all production frontend chunks now stay below `300 kB`.
- Added a dedicated markdown-renderer lazy chunk and moved runtime logging / Sentry loader work out of the main chat path.
- Fixed the verified-user handoff from `/verify-email` to `/chat` by:
  - warming auth tokens before `meGet`
  - gating `/chat` and `/profile` behind cloud/subscription hydration
  - deferring fresh-thread creation until hydration is complete
  - allowing verified users to continue into chat even if the prefetch warm-up path hits a transient failure

### Chat Stability and Prompt Guard Release

- Fixed a frontend hydration glitch in `src/context/AppContext.tsx` where normal thread/project updates were re-triggering full cloud hydration and briefly replacing the chat screen with `Loading Pluto...` during message send/receive.
- Stabilized the `/chat` experience so normal request/response activity now stays inside the chat shell and continues to show the in-chat generation state instead of the full-screen loading fallback.
- Hardened Homework mode follow-up behavior in `functions/src/services/ai/prompting.ts` so direct requests like “give complete answer” remain hint-first unless the student has genuinely earned a full solution.
- Narrowed the off-topic refusal rule so clearly educational requests like asking for a solution, a worked example, answer checking, or formula help are never mislabeled as unrelated.
- Added regression coverage for both the Homework follow-up guard and the narrowed off-topic behavior in `functions/src/services/ai/prompting.test.ts`.
- Pushed branch `nova-hybrid`, confirmed Firebase Functions in `pluto-ef61b` matched the committed backend state, deployed the latest frontend from GitHub to EC2, reloaded Nginx, and verified `https://pluto.akcero.ai` returned `200 OK` with the updated `dist/index.html` timestamp.

## 2026-04-30

### Homework Mode Guard Simplification

- Reworked Homework mode policy in `functions/src/services/ai/prompting.ts` so the backend no longer injects hardcoded quadratic-specific tutoring text.
- Replaced the previous stage-based Homework fallback with a generic, subject-agnostic turn-instruction builder for:
  - first-turn tutoring
  - direct-answer requests without student work
  - student-attempt follow-ups
- Simplified `enforceHomeworkResponsePolicy` into a true post-response safety net that only intercepts complete-solution leakage and otherwise leaves Nova's guided response untouched.
- Removed the earlier repeated-request unlock path so Homework mode never grants a full worked solution through backend policy.
- Kept Nova duplicate-response retry behavior but updated the retry instruction so Homework mode asks for a different scaffolded response instead of suggesting a full solution.

### Homework Mode Verification

- Rewrote Homework-mode regression coverage in:
  - `functions/src/services/ai/prompting.test.ts`
  - `functions/src/services/ai/orchestrator.test.ts`
  - `functions/src/services/ai/providers/novaMicroProvider.test.ts`
- Verified the updated backend with:
  - `npm.cmd test -- prompting.test.ts orchestrator.test.ts novaMicroProvider.test.ts`
  - `npm.cmd run build`
- Deployed the updated Firebase Functions to project `pluto-ef61b`, including `aiChat(asia-south1)`.
