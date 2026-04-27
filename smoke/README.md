# Pluto Smoke Suite

This suite is intended to cover the launch-critical flows called out in the audit.

## Commands

- `npm run smoke`
- `npm run smoke:headed`
- `npx playwright install`
- `cd functions && npm run smoke:delete-thread`
- `cd functions && npm run smoke:nova-fallback`
- `cd functions && npm run smoke:billing-email`

## Base URL

- `PLUTO_BASE_URL`
  - defaults to `http://127.0.0.1:5173`

## Auth + Chat

- `PLUTO_SMOKE_LOGIN_EMAIL`
- `PLUTO_SMOKE_LOGIN_PASSWORD`
- `PLUTO_SMOKE_SIGNUP_EMAIL`
- `PLUTO_SMOKE_SIGNUP_PASSWORD`
- `PLUTO_SMOKE_EMAIL_VERIFICATION_LINK`
- `PLUTO_SMOKE_GOOGLE_EMAIL`
- `PLUTO_SMOKE_GOOGLE_PASSWORD`
- `PLUTO_SMOKE_RESET_EMAIL`
- `PLUTO_SMOKE_PASSWORD_RESET_LINK`
- `PLUTO_SMOKE_NEW_PASSWORD`

## Billing

- `PLUTO_SMOKE_RAZORPAY_PLAN`
- `PLUTO_SMOKE_RAZORPAY_ASSERT_TEXT`
- `PLUTO_SMOKE_RAZORPAY_SUCCESS_URL`
- `PLUTO_SMOKE_BILLING_EMAIL_ASSERT_TEXT`
- `PLUTO_SMOKE_BILLING_EMAIL_RECIPIENT`

## Backend-only smoke helpers

- `PLUTO_SMOKE_GEMINI_API_KEY`
  - optional local override for `functions/src/scripts/smokeNovaFallback.ts`
- `SMOKE_THREAD_MESSAGE_COUNT`
  - optional message count for `functions/src/scripts/smokeDeleteThread.ts`

## Test-only UI hooks

To force the Error Boundary test in browser smoke runs, set:

- `VITE_SMOKE_TESTS=true`

Then visit:

- `/chat?plutoThrowChatError=1`

## Notes

- The browser smoke suite is env-driven and will skip tests whose credentials or links are not provided.
- `functions/src/scripts/smokeDeleteThread.ts` seeds a thread, calls the callable handler directly, and verifies the thread plus its message subcollection are gone.
- `SMOKE_THREAD_MESSAGE_COUNT=501 cd functions && npm run smoke:delete-thread` can be used to exercise the large-subcollection case beyond 500 message docs.
- `functions/src/scripts/smokeNovaFallback.ts` forces Nova credential failure locally and verifies the orchestrator falls back to Gemini.
- `functions/src/scripts/smokeBillingEmail.ts` sends a real billing-themed email through Resend and fails if the send does not succeed.
- Google sign-in and Razorpay test flows require real test credentials/accounts that are not stored in the repository.
