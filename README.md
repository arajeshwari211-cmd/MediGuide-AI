# MediGuide AI — Intelligent Healthcare Assistance Platform

> **Tagline:** Your Intelligent Companion for Better Health Awareness.  
> **UN SDG Alignment:** Sustainable Development Goal 3 (SDG 3) — *Good Health and Well-being*

---

## 1. Project Overview

**MediGuide AI** is a full-stack, AI-powered healthcare education and personal health organization platform built with React, TypeScript, Tailwind CSS, Express, SQLite, and the official Google Gemini AI SDK (`@google/genai`). It helps individuals understand general health topics, interpret laboratory reports in plain language, explore symptom warning signs, research medicine safety information with grounded sources, and manage personal health records in an isolated workspace.

---

## 2. Problem Statement

Patients frequently receive dense laboratory reports, unfamiliar medication leaflets, and fragmented health advice online. Without clear plain-language explanations, individuals struggle to understand basic medical terminology, identify urgent warning signs, prepare thoughtful questions for clinical visits, or keep track of vaccinations, allergies, and clinic visits.

---

## 3. Project Objectives

- Improve everyday health literacy using accessible, structured explanations powered by Google Gemini AI.
- Enforce strict safety boundaries: never diagnose conditions, never fabricate missing laboratory values or reference ranges, and never recommend prescription medicines or personalized dosages.
- Provide privacy-conscious document processing (temporary in-memory analysis with explicit user consent).
- Offer an isolated personal health record vault with search, category/date filtering, and full CRUD management.
- Deliver a responsive, light/dark-mode SaaS workspace suitable for academic capstone demonstration and open-source submission.

---

## 4. SDG 3 Alignment

MediGuide AI supports **United Nations Sustainable Development Goal 3 (Good Health and Well-being)**—specifically strengthening health literacy, preventive health awareness, and safe medication understanding so individuals can make informed decisions and engage more effectively with licensed healthcare providers.

---

## 5. Features

- **Landing Page & Contact Form:** Problem overview, SDG 3 alignment, module showcase, 3-step guide, live database counters, legal/disclaimer modals, and validated contact submission.
- **Cryptographic Authentication & Account Isolation:** Registration, login, password visibility toggle, forgot/reset password flow, password change, profile management, and permanent account deletion.
- **Personalized Dashboard:** Real-time statistics and Recharts visualizations generated exclusively from the authenticated user's stored records, report summaries, conversations, and activity log.
- **AI Health Assistant:** Multi-turn conversational health Q&A with suggested prompts, persistent conversation history, Markdown rendering, and confirmation-guarded deletion.
- **AI Symptom Information Module:** Structured educational analysis of symptoms, duration, and severity, highlighting red-flag warning signs, emergency guidance, and conservative self-care tips without diagnosing.
- **Multimodal Medical Report Explainer:** Supports PDF, JPG, and PNG uploads (up to 10MB) with mandatory user consent, structured test-value extraction table, questions for the doctor, and client-side PDF export (`jsPDF`).
- **Medicine Information Search:** Grounded medicine explanations using Gemini with Google Search grounding (`googleSearch`) and clickable verified source links.
- **Health Record Management:** Full CRUD vault across 6 categories (*General health information, Medical reports, Doctor visits, Allergies, Vaccination records, Other health documents*) with keyword, category, and date-range filters.
- **AI Preventive Health Tips:** Generates safe, evidence-informed wellness tips across 7 categories with save/remove functionality.
- **Settings, Multilingual Support & Notifications:** Light/dark mode persistence, full 3-language UI & AI output switching (**English**, **Kannada**, **Hindi**), database-backed In-App Notification Center with unread count and mark-as-read controls, privacy controls, and live service status indicators.

---

## 6. Technology Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Recharts, React Markdown, jsPDF + jspdf-autotable
- **Backend:** Node.js, Express 4, `tsx`
- **AI Engine:** Google Gemini API (`@google/genai`, `gemini-4-hydrogen`) with multimodal input, JSON `responseSchema`, and Google Search grounding
- **Database & Auth:** SQLite (`better-sqlite3` with WAL mode & foreign keys), `scrypt` password hashing, HMAC-SHA256 signed `HttpOnly` session cookies

---

## 7. System Architecture

```text
├── index.html                 # HTML entry point & Google Fonts (Latin, Kannada, Devanagari)
├── metadata.json              # App metadata & capabilities
├── package.json               # Dependencies, Node >=22.18.0 engine & build/start scripts
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite & Tailwind CSS v4 configuration
├── .env.example               # Template for required environment variables (no secrets)
├── .gitignore                 # Excludes node_modules, dist, .env*, SQLite DBs & local secrets
├── server.ts                  # Express server, API routes, Vite middleware / static serving
├── server/
│   ├── auth.ts                # scrypt password hashing, HMAC cookie sessions, requireAuth guard
│   ├── db.ts                  # SQLite schema & activity/notification helpers
│   ├── gemini.ts              # Server-side @google/genai client & structured safety prompts
│   └── i18nErrors.ts          # Multilingual backend error, validation & notification messages
└── src/
    ├── App.tsx                # SPA routing, providers & error boundary setup
    ├── index.css              # Tailwind CSS v4 theme & typography rules
    ├── main.tsx               # React root entry point
    ├── assets/images/         # Bundled illustration assets
    ├── components/            # BrandLogo, ConfirmDialog, ErrorBoundary, Toast
    ├── context/               # AuthContext, LanguageContext, ThemeContext
    ├── i18n/                  # English (en), Kannada (kn), and Hindi (hi) translation dictionaries
    ├── layouts/               # AppLayout (responsive sidebar, notification bell, language switcher)
    ├── pages/                 # LandingPage, AuthPage, Dashboard & all workspace pages
    ├── services/              # API fetch wrapper with active language header & error mapping
    ├── types/                 # Shared TypeScript interfaces
    └── utils/                 # jsPDF medical report summary exporter
```

All `@google/genai` calls execute strictly server-side behind `requireAuth` middleware so the API key is never exposed to browser JavaScript.

---

## 8. Local Installation Instructions

### Prerequisites
- **Node.js `>= 22.18.0`** (required for native TypeScript execution in `node server.ts`; `tsx` is also included for `npm run dev`)
- **npm** (`>= 10`)
- A **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

### Setup Steps
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment variables** (copy `.env.example` to `.env` and fill in your values):
   ```bash
   cp .env.example .env
   ```
3. **Run in development mode** (serves Vite + Express on port `3000`):
   ```bash
   npm run dev
   ```
4. **Build and run in production locally:**
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

---

## 9. Environment Variable Configuration

Create a `.env` file (never commit `.env` or `.mediguide_secret` to GitHub or include them in shared ZIP archives):

```env
GEMINI_API_KEY="your_google_gemini_api_key"
APP_URL="https://your-public-domain.com"
SESSION_SECRET="replace_with_a_64_character_random_secret"
NODE_ENV="production"
PORT="3000"
# Optional: point SQLite to a mounted persistent disk in cloud hosting
# DB_PATH="/var/data/mediguide.db"
```

---

## 10. Public Deployment Guide

MediGuide AI runs as a **single unified Node.js + Express full-stack service** (serving both `/api/*` endpoints and the compiled React `dist/` bundle on one domain, so `HttpOnly` session cookies work seamlessly without CORS configuration).

### Option A: Share Directly via Google Cloud Run / AI Studio Deploy
If you want a public URL immediately from Google AI Studio Build mode, use the **Deploy / Share** button in the AI Studio top bar (Cloud Run) after setting `GEMINI_API_KEY` in AI Studio Secrets.

### Option B: Deploy from Source ZIP to Render, Railway, Fly.io, or a VPS
1. **Verify clean source archive:** Ensure `node_modules/`, `dist/`, `.env*` (except `.env.example`), `.mediguide_secret`, and `mediguide.db*` are **excluded** before pushing to Git or deploying.
2. **Select Node.js 22+ runtime** (automatically declared in `package.json` under `"engines"`).
3. **Build command:**
   ```bash
   npm install && npm run build
   ```
4. **Start command:**
   ```bash
   NODE_ENV=production npm start
   ```
5. **Required Environment Variables on your host:**
   - `NODE_ENV=production`
   - `GEMINI_API_KEY=<your-gemini-api-key>`
   - `SESSION_SECRET=<random-64-char-hex-string>` (generate with `openssl rand -hex 32`)
   - `APP_URL=<your-public-https-url>`
   - `PORT=3000` (or let your hosting platform inject `PORT` automatically)
6. **Persistent SQLite Storage (Important):**
   - MediGuide AI uses SQLite to store user accounts, health records, saved reports, and notifications. By default, the database is stored locally in `./mediguide.db`.

   On hosting platforms with ephemeral storage, such as Render Free Tier, database files may be lost when the service restarts or redeploys. To preserve data, configure a persistent disk and set the `DB_PATH` environment variable to the mounted disk location (for example, `/data/mediguide.db`).
---

## 11. Database Note
- **Database Configuration:** MediGuide AI uses SQLite (`mediguide.db`) with WAL mode and foreign keys enabled. User data is isolated using strict per-user `WHERE user_id = ?` queries. Passwords are secured using `scrypt` hashing, and sessions use HMAC-SHA256 signed `HttpOnly` cookies.

- **Data Persistence:** Database persistence depends on the hosting environment. On platforms with ephemeral storage, configure a persistent disk and set the `DB_PATH` environment variable to prevent database files from being lost during restarts or redeployments.

## 12. Gemini API Setup

1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
2. Set `GEMINI_API_KEY` in your `.env` file (or in **Settings > Secrets** inside AI Studio).
3. All AI requests route through `/api/assistant/*`, `/api/symptoms/*`, `/api/reports/*`, `/api/medicines/*`, and `/api/tips/*` on the Express server using `gemini-4-hydrogen`.

---

## 13. Future Scope

- Voice-based AI health assistant using real-time speech APIs
- Integration with wearable health trackers and standardized FHIR exports
- Verified clinical terminology database connectors
- Healthcare professional appointment scheduling workflows
- Native mobile companion application

---

## 14. Safety and Medical Disclaimer

MediGuide AI is strictly an **educational and informational tool** designed to improve health literacy. It is **not** a medical device, does **not** diagnose diseases, does **not** prescribe medications or dosages, and is **not** a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a qualified physician, pharmacist, or licensed healthcare provider with any questions regarding a medical condition, laboratory report, or medication. In a medical emergency, contact your local emergency services immediately.
