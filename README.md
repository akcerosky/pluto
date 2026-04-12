# Pluto

Pluto is an AI-powered learning companion for students and professionals. It combines Gemini-powered tutoring, Firebase Authentication, Firestore chat persistence, learning modes, plan limits, project organization, and a polished React interface.

## Features

- AI chat powered by Google Gemini
- Adaptive Pluto system prompt for education-only learning support
- Firebase Authentication with email/password and Google sign-in
- Firestore persistence for chat history and projects under each Firebase user UID
- Chat refresh recovery using local storage plus Firestore sync
- Learning modes:
  - Conversational
  - Homework
  - Exam Prep
- Subscription-style plan configuration:
  - Free: daily request limit, smaller context window
  - Plus: higher limits and more modes
  - Pro: unlimited daily usage and extended context
- Project folders for organizing chats
- Markdown rendering with math support through KaTeX
- Profile page for learning preferences and plan selection
- PhonePe subscription checkout integration hooks
- Responsive dark UI with Framer Motion animations
- Production deployment support with Vite build output and Nginx

## Tech Stack

- React 19
- TypeScript
- Vite 8
- Firebase Auth
- Cloud Firestore
- Google Gemini via `@google/generative-ai`
- React Router
- Framer Motion
- React Markdown
- Remark Math
- Rehype KaTeX
- Lucide React icons
- ESLint

## Requirements

Use Node.js `20.19+` or `22.12+`.

This project uses Vite 8, which does not run correctly on older Node 20 versions such as `20.16.0`.

Recommended:

```bash
node -v
npm -v
```

If your Node version is too old, install Node 22.

## Local Setup

Clone the repo:

```bash
git clone https://github.com/m-manish03/pluto.git
cd pluto
```

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Fill in the required values:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123

VITE_BILLING_API_BASE_URL=http://localhost:8787/api
```

Run locally:

```bash
npm run dev
```

Serves the production build locally for preview.

```bash
npm run lint
```

Runs ESLint across the project.

## Firebase Setup

Create or open a Firebase project, then enable:

- Authentication
- Firestore Database

In Firebase Authentication, enable these sign-in providers:

- Email/Password
- Google

For local development, ensure this authorized domain exists:

```text
localhost
```

For production, add:

```text
pluto.akcero.ai
```

Recommended Firestore rule shape:

```js
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Chat and project state is saved at:

```text
users/{firebaseAuth.currentUser.uid}/appState/main
```

## Gemini Setup

Create a Gemini API key in Google AI Studio or your Google Cloud setup, then set:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
```

The Gemini call lives in:

```text
src/hooks/useAI.ts
```

Pluto sends:

- the user's current query
- recent chat history
- education level
- learning objective
- interaction mode
- subscription plan
- Pluto's educational system instruction

## Plan Limits

Plan configuration lives in:

```text
src/config/subscription.ts
```

The Free plan daily chat limit is controlled by:

```ts
dailyMessageLimit: 15
```

The enforcement logic lives in:

```text
src/context/AppContext.tsx
```

## PhonePe Billing Integration

The frontend is wired for PhonePe subscription checkout from the Profile page.

Backend API base URL:

```env
VITE_BILLING_API_BASE_URL=http://localhost:8787/api
```

Expected backend endpoints:

```text
POST /billing/phonepe/subscription/create
POST /billing/phonepe/subscription/verify
```

After payment, PhonePe should redirect back to:

```text
/profile?phonepe_return=1&plan=<Plus|Pro>&merchantOrderId=...&transactionId=...
```

## Production Build

Build the app:

```bash
npm run build
```

The production output is created in:

```text
dist
```

Deploy `dist` behind a static web server such as Nginx.

For a React Router single-page app, Nginx should fall back to `index.html`:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## EC2 Deployment Notes

The current deployment pattern is:

```bash
cd /var/www/pluto
git fetch origin main
git reset --hard origin/main
npm ci
npm run build
sudo systemctl reload nginx
```

The production domain is:

```text
https://pluto.akcero.ai
```

Nginx serves:

```text
/var/www/pluto/dist
```

## Project Structure

```text
src/
  components/
    Chat/
    Layout/
    Modals/
    Modes/
    ui/
  config/
    billing.ts
    subscription.ts
  context/
    AppContext.tsx
  hooks/
    useAI.ts
  lib/
    firebase.ts
  pages/
    AuthPages.tsx
    LandingPage.tsx
    ProfilePage.tsx
  services/
    phonepe.ts
  types/
    index.ts
```

## Notes

- Do not commit `.env`.
- Use `.env.example` for documenting required variables.
- Firebase Auth must be enabled before login works.
- Firestore rules must allow the authenticated user to access their own `users/{uid}` path.
- Vite 8 requires a newer Node version than older Node 20 releases.
