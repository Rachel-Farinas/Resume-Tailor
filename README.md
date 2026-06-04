# Resume Tailor

A web app that tailors your resume to a specific job posting using Google's
Gemini API. You enter your background (or auto-fill it from a LinkedIn PDF),
paste a job posting, and the app rewrites your experience and projects into
tailored, metric-driven bullet points — then renders a clean, professionally
formatted resume you can download as a PDF.

## Features

- **Tailored generation** — Gemini rewrites your experience/projects to match a
  job posting, prioritizing the most relevant content and weaving in keywords.
- **Grounded, not fabricated** — the prompt is tuned to stay faithful to what you
  actually provide; it won't invent responsibilities or numbers.
- **Fill with LinkedIn** — upload your LinkedIn profile PDF (Profile → Resources
  → Save to PDF) and the form auto-fills your basics, education, skills,
  experience, and projects.
- **Formatted preview + PDF download** — the result renders in a fixed resume
  template and downloads as a PDF via the browser's print-to-PDF.
- **Inline validation** — required fields and minimum word counts are checked
  before submission.

## Tech stack

- **Frontend:** vanilla HTML, CSS, and JavaScript (no framework)
- **Backend:** Node.js + Express
- **AI:** [`@google/generative-ai`](https://www.npmjs.com/package/@google/generative-ai)
  (`gemini-2.5-flash`) with structured JSON output via response schemas

## File structure

```
.
├── client/                 # Static frontend (served by the Express server)
│   ├── index.html          # Form + result markup
│   ├── app.js              # Form logic, validation, LinkedIn import, render, PDF
│   └── styles.css          # Styling, including the resume-page template
├── server/                 # Node/Express backend
│   ├── index.js            # Express app: serves client/ + mounts API, reads PORT
│   ├── routes/
│   │   └── resume.js        # Gemini integration + API routes (schemas, prompts)
│   ├── .env.example        # Template for required environment variables
│   └── package.json        # Server dependencies and start script
└── README.md
```

### API routes (mounted at `/api/resume`)

- `POST /api/resume/match-roles` — takes the form data + job posting, returns the
  tailored resume as structured JSON.
- `POST /api/resume/import-linkedin` — takes a base64 LinkedIn PDF, returns the
  extracted profile as structured JSON for auto-filling the form.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (for the built-in `fetch`/ESM support)
- A Gemini API key — get one free at https://aistudio.google.com/apikey

## Setup (local)

```bash
# 1. Clone the repo
git clone https://github.com/Rachel-Farinas/Resume-Tailor.git
cd Resume-Tailor/server

# 2. Install server dependencies
npm install

# 3. Create your .env from the example and add your key
cp .env.example .env        # on Windows PowerShell: copy .env.example .env
#   then edit .env and set: GEMINI_API_KEY=your_real_key

# 4. Start the server (it also serves the frontend)
npm start
```

Then open **http://localhost:3000** in your browser.

> The frontend is plain static files served by the Express server, so there's
> nothing to build or install in `client/`.

## Environment variables

| Variable         | Required | Description                                              |
| ---------------- | -------- | -------------------------------------------------------- |
| `GEMINI_API_KEY` | Yes      | Your Google Gemini API key.                              |
| `PORT`           | No       | Port to listen on (defaults to `3000`; set by the host). |

`.env` is gitignored and never committed — keep your key out of version control.

## Deploy (Render)

This deploys as a single **Web Service** (the Express server serves both the API
and the frontend):

1. Create a new **Web Service** and connect this repo.
2. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Add an environment variable: `GEMINI_API_KEY` = your key.
4. Deploy. Render injects `PORT` automatically.

> Note: a public deployment lets anyone with the URL use the app and consume your
> Gemini quota.

## How it works

1. You fill the form (or import from a LinkedIn PDF) and paste a job posting.
2. The client validates input and POSTs it to the Express server.
3. The server prompts Gemini with a strict, anti-fabrication prompt and a
   response schema, getting back structured JSON.
4. The client renders that JSON into a formatted resume page and offers a
   print-to-PDF download.
