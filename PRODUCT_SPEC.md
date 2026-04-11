# Pluto: Technical & Product Specification

## 🚀 Overview
**Pluto** is a full-featured AI education platform designed to be a lifelong learning companion. It adapts its intelligence to your level—from elementary storytelling to professional-grade technical synthesis—all within a premium, multi-threaded workspace.

---

## 🛰️ Core Product Features

### 1. Adaptive Intelligence Engine
Pluto’s persona and logic automatically shift based on the student’s **Education Level**:
- **Elementary**: Uses a "Space Buddy" persona with fun metaphors, simple language, and encouraging "Power-Up" feedback.
- **High School & Academic**: Acts as a knowledgeable academic tutor, focusing on structure, clarity, and deep conceptual understanding.
- **Professional**: Functions as a high-level research assistant, utilizing industry terminology and synthesizing complex methodologies.

### 2. Full-Featured Platform
A complete user journey inspired by modern educational SaaS:
- **Landing Page**: A high-impact product discovery page showcasing Pluto's unique value props.
- **Authentication**: Secure Signup and Login flows with persistent user sessions.
- **User Profiles**: Manage learning objectives, education levels, and account preferences in a dedicated settings area.

### 3. Multi-Thread Conversation Workspace
Manage multiple learning paths simultaneously:
- **Thread History**: Persistent sidebar with a list of recent chats, automatically titled by AI.
- **Subject Grouping**: Organization for various topics, allowing users to switch contexts instantly without losing state.
- **Thread Control**: Create, name, and delete conversations as your learning goals evolve.

### 4. Interactive Quick Action Chips
Dynamic, level-aware action buttons that trigger instant specialized AI workflows:
- **Elementary**: Story Mode, Riddle Me, Power-Up.
- **Academic**: Concept Breakdown, Analogy please, Break it down.
- **Professional**: Abstract Summary, Critique Logic, Practice Case.

### 5. Multi-Mode Learning Framework
Choose the right tutoring style for the task:
- **Exploration**: Brainstorming and research.
- **Homework**: Strict Socratic guidance that builds solving skills without giving away the answer.
- **Exam Prep**: Mock tests, practice drills, and certification simulations.

---

## 🎨 UI/UX Excellence
- **Layout Architecture**: A persistent sidebar (collapsible) and a distraction-free main chat viewport.
- **Design Language**: Modern "Glassmorphism" with a premium space-themed aesthetic.
- **Animations**: Fluid, low-latency transitions powered by `framer-motion`.
- **Math Ready**: Full LaTeX support for rendering complex formulas beautifully.

---

## 🛠️ Technical Stack
- **Framework**: React 19 + Vite 8
- **Language**: TypeScript (Strict type-only imports)
- **Routing**: React Router for seamless page transitions.
- **AI Backend**: Google Generative AI (Gemini Flash)
- **Icons**: Lucide React
- **Rendering**: React-Markdown with rehype-katex / remark-math.

---

## 🛡️ Security & Integrity
- **Session Persistence**: Robust `localStorage` synchronization for user data and thread history.
- **Safe Environment**: Filtered AI history to maintain technical SDK constraints while prioritizing user privacy.
- **API Key Sanitization**: Environment-driven secret management.
