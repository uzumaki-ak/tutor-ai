# Cuemath AI Tutor Screener

AI-powered voice interviewer that screens tutor candidates and generates structured assessments.
Built for the Cuemath AI Builder Challenge.

---

## Live Demo Flow

1. Open the app -> fill in candidate name, pick AI voice gender, subject, and age group.
2. Click **Check Microphone** -> allow mic permission -> speak to test.
3. Click **Begin Interview** -> AI greets and starts the first question.
4. Press and hold **Spacebar** (or hold the mic button) to record each answer -> release to send.
5. AI transcribes voice, responds with next question, and speaks it aloud.
6. After 6 candidate answers, interview is force-closed with a final thank-you line.
7. Candidate sees a completion screen ("We'll be in touch soon"), not internal scoring.
8. Admin receives full report by email (PDF attachment) with transcript + scoring.

---

## What This Solves

Manual tutor screening takes time and can be inconsistent interviewer-to-interviewer.
This app creates a consistent interview loop with:

- fixed soft-skill rubric,
- structured evidence extraction,
- deterministic end-of-interview handling,
- automatic admin-ready reporting.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 16.2 (App Router) + TypeScript | Route handlers + modern React architecture |
| Styling | Tailwind CSS + CSS animations | Fast UI iteration with lightweight runtime |
| LLM Primary | Groq - Llama 3.3 70B Versatile | Fast low-latency responses |
| LLM Fallback 2 | Google Gemini 2.5 Flash | Backup provider |
| LLM Fallback 3 | OpenRouter - Llama 3.3 70B | Backup provider |
| LLM Fallback 4 | Euron - gpt-4.1-nano | Last fallback |
| STT | Groq Whisper Large v3 Turbo | Speech transcription |
| TTS | Browser `window.speechSynthesis` | Free, no backend TTS dependency |
| Database | Supabase (Postgres) | Stores interviews and transcripts |
| Email | Resend API | Admin report delivery |
| PDF | `pdf-lib` | Server-generated branded report attachment |

---

## Reliability Highlights

- **Evaluator parsing hardening**:
  - strict JSON prompt,
  - parse + repair retry path,
  - fallback structured score if model output is malformed.
- **Interview end hardening**:
  - enforces close after 6 user turns,
  - prevents endless follow-up loops.
- **Mic turn control**:
  - blocks recording on `completed` / `error`,
  - avoids "keep talking" after final round.
- **STT script stabilization**:
  - transcription prompt/language controls to reduce Urdu-script drift for Hinglish/English speech.

---

## Project Structure

```txt
tutor-screener/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── interview/
│   │   ├── page.tsx
│   │   └── complete/page.tsx
│   ├── results/page.tsx                # redirects to completion route
│   └── api/
│       ├── chat/route.ts
│       ├── transcribe/route.ts
│       └── evaluate/route.ts
├── components/
│   ├── interview/
│   ├── results/
│   └── ui/
├── hooks/
│   ├── useConversation.ts
│   ├── useMicrophone.ts
│   └── useSpeech.ts
├── lib/
│   ├── llm/
│   │   ├── index.ts
│   │   ├── groq.ts
│   │   ├── gemini.ts
│   │   ├── openrouter.ts
│   │   └── euron.ts
│   ├── adminReport.ts                  # PDF generation + Resend email send
│   ├── prompts.ts
│   └── supabase.ts
├── supabase/schema.sql
├── types/index.ts
├── .env.example
└── package.json
```

---

## Environment Variables

### 1) Copy template

```bash
cp .env.example .env.local
```

### 2) Fill required values

```env
# LLM providers
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
EURON_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Transcription controls
TRANSCRIBE_LANGUAGE=en
TRANSCRIBE_PROMPT=Transcribe exactly what is spoken in Latin script; do not translate into Urdu script.

# Resend email reporting
RESEND_API_KEY=
RESEND_FROM_EMAIL=Cuemath Screener <onboarding@resend.dev>
ADMIN_REPORT_EMAIL=admin@example.com
```

---

## Local Setup

### Step 1 - Install

```bash
npm install
```

### Step 2 - Run

```bash
npm run dev
```

Open: `http://localhost:3000`

---

## API Keys (Free Tiers)

### Groq (LLM + Whisper)
1. Create account at `console.groq.com`
2. Generate API key
3. Set `GROQ_API_KEY`

### Gemini
1. Create key at `aistudio.google.com`
2. Set `GEMINI_API_KEY`

### OpenRouter
1. Create key at `openrouter.ai`
2. Set `OPENROUTER_API_KEY`

### Euron
1. Create key at `euron.one`
2. Set `EURON_API_KEY`

### Supabase
1. Create project at `supabase.com`
2. Run `supabase/schema.sql` in SQL editor
3. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### Resend
1. Create API key at `resend.com`
2. Set:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (verified sender)
   - `ADMIN_REPORT_EMAIL` (recipient inbox)

---

## Admin Email Report (Resend + PDF)

On interview completion (`/api/evaluate`):

1. Candidate transcript is evaluated with fallback chain.
2. Result is stored to Supabase.
3. PDF report is generated server-side and attached to email.
4. Email is sent to `ADMIN_REPORT_EMAIL`.

PDF includes:
- candidate details,
- verdict and overall score,
- all rubric dimensions with evidence and feedback,
- full transcript,
- provider/fallback metadata and interview ID (if DB insert returns one).

If email fails, interview completion still succeeds (non-blocking delivery).

---

## Deployment (Vercel)

```bash
npx vercel --prod
```

In Vercel dashboard, add all `.env.local` keys as project environment variables, then redeploy.

---

## Testing Checklist

### Page 1 - Landing
- [ ] Name required validation works
- [ ] Subject and age-group selectors work
- [ ] Mic-check flow starts correctly

### Page 2 - Mic Check
- [ ] Browser asks mic permission
- [ ] Speaking animates visualizer
- [ ] "Mic ready" state is shown

### Page 3 - Interview
- [ ] AI speaks first message
- [ ] Spacebar hold-to-record works
- [ ] Release sends audio and starts transcribe step
- [ ] Progress increments turn by turn
- [ ] After 6 answers, AI closes interview (no extra loops)

### Completion (Candidate-safe)
- [ ] Candidate sees thank-you screen
- [ ] Candidate cannot view internal score dashboard

### Admin Reporting
- [ ] Evaluation result saved in Supabase
- [ ] Admin inbox receives PDF report via Resend
- [ ] PDF includes transcript + score breakdown

---

## Assessment Rubric

Dimensions scored 1-5:

- Clarity of Explanation
- Warmth and Empathy
- Ability to Simplify
- Patience
- English Fluency

Verdict thresholds:
- **Pass**: average >= 3.5
- **Review**: average 2.5-3.4
- **Fail**: average < 2.5

---

## LLM Fallback Chain

Used for chat/evaluation reliability:

1. Groq
2. Gemini
3. OpenRouter
4. Euron

If all fail, error is surfaced instead of silently failing.

---

## Key Decisions and Tradeoffs

- **Candidate privacy UX**: moved away from showing raw internal score to candidate.
- **Strict deterministic closure**: after max turns, system forces final close line.
- **Resilient evaluator parser**: adds complexity, but avoids broken UX on malformed JSON.
- **PDF server generation**: heavier backend path than simple HTML email, but much better for hiring review portability.

---

## What I'd Improve With More Time

- Admin dashboard with searchable past interviews.
- Secure signed report links and role-based access.
- Better multilingual transcription controls and confidence scoring.
- Queue/retry worker for email delivery with status tracking.
- Rich analytics on rubric drift across candidate cohorts.

---

## Interesting Challenges Solved

- **Malformed evaluator JSON** causing runtime failures:
  - fixed with parse-extract-repair-fallback strategy.
- **Interview not ending cleanly**:
  - fixed with turn-limit enforcement in chat route.
- **Script drift in transcription** (English/Hinglish -> Urdu script):
  - mitigated via forced transcription language/prompt controls.

---

## Git Safety

`.gitignore` ignores `.env*` by default, so API keys are not pushed.
