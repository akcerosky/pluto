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