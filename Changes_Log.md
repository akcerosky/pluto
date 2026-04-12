# Pluto Changes - 2026-04-12

## Product and App Behavior

- Added Firebase-backed chat persistence under the signed-in user's app state.
- Fixed chat refresh behavior so saved conversations remain available after reload.
- Updated login behavior so existing signed-in users are redirected to chat instead of seeing the login form again.
- Changed login flow so users land on a fresh blank chat state after signing in, while older chats remain available in Recent Chats.
- Added cleanup for empty chats so conversations with no messages are removed from localStorage and Firestore sync.

## AI Behavior

- Updated Pluto's Gemini system instruction in `src/hooks/useAI.ts`.
- Added stronger educational-only identity, jailbreak resistance, response formatting, and learning-mode behavior.
- Added the Akcero creator response so Pluto answers creator/team questions consistently and redirects back to studying.

## Routes and Policy Pages

- Added policy pages for Terms & Conditions, Privacy Policy, and Refund and Cancellation Policy.
- Updated policy routes to:
  - `/terms`
  - `/privacy`
  - `/refund`
- Kept footer link titles and policy page titles unchanged.
- Reduced policy page title size.

## Responsive UI

- Refactored the app layout for mobile, tablet, and desktop.
- Added a mobile top bar and sidebar drawer for the logged-in chat app.
- Improved chat header wrapping, message bubble sizing, composer spacing, and empty chat state on small screens.
- Added a mobile landing-page navigation menu.
- Improved responsive behavior for pricing cards, the pricing comparison section, auth pages, profile page, project modal, and policy pages.
- Fixed hero paragraph alignment, mobile Login button styling, and reduced footer height.

## README and Deployment

- Rewrote the project README with local setup, features, tech stack, Firebase configuration, and EC2 deployment notes.
- Added `scripts/deploy-ec2.ps1` to update the EC2 deployment by pulling from GitHub and building on the server.
- Deployed the latest `main` branch to EC2 for `https://pluto.akcero.ai`.

## Verification

- Ran production builds after the major updates.
- EC2 deployment completed successfully with Nginx config validation and reload.
- Known warnings remain:
  - Local Node version warning from Vite.
  - Large client bundle warning from Vite.
  - `npm ci` on EC2 reported dependency audit warnings that were not auto-fixed.
