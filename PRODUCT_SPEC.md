# Pluto: Product and Technical Specification

## Overview

Pluto is an AI tutoring platform built around persistent chat threads, guided study modes, server-enforced usage limits, and subscription billing. The current production stack uses a React frontend, Firebase Auth + Firestore + Functions, Amazon Nova and Google Gemini for model access, and Razorpay for recurring billing.

## Core User Experience

### 1. Authentication and onboarding
- Email/password signup and login
- Google sign-in
- Email verification after signup
- Password reset from the login page
- Auth action pages for verification and password reset hosted under `__/auth/action`

### 2. Persistent chat workspace
- Multi-thread chat sidebar with thread history
- Project grouping for organizing threads
- Automatic thread titling
- Firestore-backed persistence for threads, messages, and lightweight app state
- Thread deletion through a callable Function that also removes message subcollections

### 3. Learning modes
- `Conversational` for open-ended tutoring
- `Homework` for guided help
- `ExamPrep` for test-focused practice

Free users can use Conversational mode and receive a limited number of Homework / Exam Prep uses per day. Paid tiers unlock full mode access with larger quotas and attachment support.

### 4. Attachments and rich responses
- Image attachments for paid plans
- PDF attachments for Pro
- Markdown and LaTeX rendering in assistant messages
- Long-thread pagination and summary continuity support

## Plans and Limits

### Free
- 25,000 tokens per day
- Conversational mode
- 3 Homework / Exam Prep uses per day
- No attachments
- Up to 2 projects

### Plus
- 250,000 tokens per day
- Conversational, Homework, and Exam Prep
- Image attachments enabled

### Pro
- 1,000,000 tokens per day
- Conversational, Homework, and Exam Prep
- Image and PDF attachments enabled

## Data Model

### Client-managed Firestore collections
```text
users/{uid}/appState/main
users/{uid}/threads/{threadId}
users/{uid}/threads/{threadId}/messages/{messageId}
users/{uid}/projects/{projectId}
users/{uid}/meta/migration
```

### Server-managed Firestore collections
```text
users/{uid}/profile/main
users/{uid}/subscriptionPublic/main
users/{uid}/subscriptionPrivate/main
users/{uid}/payments/{paymentRecordId}
users/{uid}/billingEvents/{providerEventId}
users/{uid}/usageDaily/{YYYY-MM-DD-IST}
```

## Architecture

### Frontend
- React 19 + Vite
- React Router
- Framer Motion
- Firebase Web SDK
- Sentry for production error monitoring

### Backend
- Firebase Functions v2 on Node 22
- Firestore Admin SDK
- Amazon Nova as the primary text route
- Google Gemini used for supported fallback / attachment workflows
- Razorpay billing integration
- Resend for billing and transactional email

## Security and Reliability

- Firebase Auth is required for app access
- Callable Functions enforce App Check
- Auth action pages intentionally skip App Check initialization because they rely on Firebase Auth flows directly
- Firestore rules restrict sensitive billing, usage, and profile writes to server-side code
- Assistant replies are persisted server-side before success is returned to the client
- Password reset and auth pages use direct button handlers rather than browser form submission

## Observability

- Frontend Sentry initialization is production-only and controlled by `VITE_APP_ENV` and `VITE_SENTRY_DSN`
- Production Functions log operational events for AI, billing, and chat cleanup flows

## Current Known Follow-Ups

- Large frontend chunks still exist around assistant rendering and some vendor/runtime bundles
- Additional live smoke coverage is still valuable for billing, delete-thread, and fallback verification
