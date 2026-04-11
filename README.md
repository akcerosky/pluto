# 🪐 Pluto: Your AI Learning Astronaut

Welcome to **Pluto**, a premium AI-powered learning platform built for the next generation of students and professionals.

## ✨ Quick Links
- **[Product Specification](./PRODUCT_SPEC.md)**: Deep dive into the features and technical architecture.
- **[Walkthrough Artifact](file:///Users/akcerooffice/.gemini/antigravity/brain/7a381cb3-8d19-4d20-8fe5-d50a5d1ef0bd/walkthrough.md)**: See the latest development progress and verification results.

## 🚀 Getting Started
1. **Clone & Install**:
   ```bash
   npm install
   ```
2. **Environment Setup**:
   Create a `.env` file in the root and add your keys:
   ```env
   VITE_GEMINI_API_KEY=your_key_here
   VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abc123

   VITE_BILLING_API_BASE_URL=http://localhost:8787/api
   ```
   You can also copy from `.env.example`.

## PhonePe Subscription Integration (Frontend Ready)

The app is wired for PhonePe subscription checkout from the Profile page.

Frontend calls these backend endpoints:

- `POST /billing/phonepe/subscription/create`
  - Request: `{ userId, name, email, plan, amountInr, redirectUrl }`
  - Response: `{ checkoutUrl, merchantOrderId }`
- `POST /billing/phonepe/subscription/verify`
  - Request: `{ merchantOrderId, transactionId? }`
  - Response: `{ status: "SUCCESS" | "PENDING" | "FAILED", merchantOrderId, plan? }`

After payment, PhonePe should redirect back to:
- `/profile?phonepe_return=1&plan=<Plus|Pro>&merchantOrderId=...&transactionId=...`
3. **Run Development Server**:
   ```bash
   npm run dev
   ```

## 🧠 Core Philosophy
Pluto isn't just a chatbot; it's an **Adaptive learning companion**. By detecting your education level and learning objective, it tailors its entire interface and intelligence to meet you exactly where you are.

### Modes of Learning
- **Conversational**: For curiosity and brainstorming.
- **Homework**: For guided, Socratic problem-solving.
- **Exam Prep**: For simulation and test-readiness.

---
*Built with React, TypeScript, and 🌌 by the Pluto Team.*
