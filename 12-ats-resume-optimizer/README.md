# AI-Powered Resume / ATS Optimizer

Upload a resume (PDF or DOCX), paste a job description, and get:

- **Semantic match score** (0–100) with a section-by-section breakdown
- **Keyword gap analysis** — which JD terms are missing, with *honest* incorporation suggestions only
- **Bullet rewrites** — before/after suggestions for weak bullets, with strict no-fabrication rules
- **PDF export** of the optimized resume with your accepted rewrites applied

Built with **Next.js 14 (App Router)**, **TypeScript**, and the **OpenAI API** (chat + embeddings). Stateless — no database required.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then set OPENAI_API_KEY
npm run dev                  # http://localhost:3000
```

Try it immediately with the included sample pair:

```bash
npm run sample:pdf           # generates samples/sample-resume.pdf
```

Then upload `samples/sample-resume.pdf` and paste the contents of `samples/sample-job-description.txt`.

---

## Architecture

```
app/
  page.tsx                 ← single-page UI (upload, JD input, results, export)
  api/analyze/route.ts     ← parse → structure → score → gaps → rewrites
  api/export/route.ts      ← structured resume JSON → formatted PDF
lib/
  parse/extractText.ts     ← PDF (pdf-parse) / DOCX (mammoth) → raw text + warnings
  parse/structure.ts       ← LLM structuring into typed sections + systemic checks
  scoring.ts               ← embeddings, cosine, rescaling, blended score
  analysis.ts              ← keyword gap extraction + bullet rewriting (LLM)
  pdf.ts                   ← pdf-lib renderer (single-column, ATS-friendly)
  llm.ts                   ← OpenAI wrapper: validated JSON output w/ retry
```

## Parsing approach

1. **Text extraction.** `pdf-parse` for PDFs, `mammoth` for DOCX. Text is normalized (whitespace, line breaks).
2. **Extraction-quality checks** *before* any AI runs:
   - **Scanned/image PDFs**: if extracted characters per page < 200, we stop with a clear error (no OCR pipeline in scope — analyzing garbage would produce garbage advice).
   - **Multi-column / table layouts**: if >25% of lines are ≤3 chars or >30% contain wide internal gaps, extraction is likely out of order — the user gets an explicit warning that accuracy may suffer.
3. **LLM structuring.** The raw text is converted to typed JSON (`contact / summary / experience[] / education[] / skills[] / other`) under a *verbatim-copy* system prompt: the model may not invent or embellish anything. Output is validated with a strict TypeScript validator; invalid output is retried once with the validation error fed back.
4. **Systemic checks** on the structured result: missing experience/skills sections, and a **no-metrics flag** if zero bullets contain any number — surfaced to the user rather than silently "fixed".

## Matching methodology

The overall score blends two signals:

```
overall = 0.6 × semantic_fit + 0.4 × keyword_coverage
```

- **Semantic fit** — the JD, the full resume, and each section (Summary, Skills, Experience, Education) are embedded (`text-embedding-3-small`, one batched call). Cosine similarity is computed against the JD. Because unrelated professional documents already score ~0.2 and strong matches ~0.75 with this model, raw cosine is linearly rescaled from `[0.20, 0.75]` to `[0, 100]` (clamped) — otherwise every result would land in a misleading middle band. Bounds live in `lib/scoring.ts` and are easy to tune.
- **Keyword coverage** — the LLM extracts 12–20 key terms from the JD with importance ratings, then checks each against the resume (literal or clear synonym, e.g. Postgres ≈ PostgreSQL). Coverage is weighted: high = 3×, medium = 2×, low = 1×. This mirrors the literal term filtering real ATS systems perform, which embeddings alone would hide.

Section scores are embedding-based only and answer "which part of my resume is dragging the match down?"

## Honesty guarantees (no fabrication)

This tool is deliberately conservative — an optimizer that lies gets candidates rejected in interviews:

- **Keyword suggestions**: a missing term only gets an incorporation suggestion when existing resume content plausibly supports it. Otherwise the suggestion is `null` and the UI says so explicitly.
- **Bullet rewrites**: rewrites may reword, restructure, and emphasize — never add accomplishments, technologies, or scope. Where a metric would help, the rewrite inserts a bracketed placeholder (`[X%]`, `[N users]`) for the candidate's *real* number.
- **Zero-metrics resumes** are flagged as a systemic issue instead of being auto-filled with invented figures.

## Edge cases handled

| Case | Behavior |
|---|---|
| Scanned/image PDF | Hard stop with explanation (low text yield per page) |
| Multi-column/table layout | Parsed with an explicit accuracy warning |
| Extremely short/vague JD (<300 chars) | Analysis proceeds with a reliability warning |
| Resume with no quantifiable metrics | Flagged; rewrites use placeholders, never invented numbers |
| Missing sections (skills/experience) | Explicit warnings; scoring skips absent sections |
| Unsupported file type / >8 MB | 400 with clear message |
| Malformed LLM output | Validated + one self-correcting retry, then clean 500 |

## API

- `POST /api/analyze` — multipart form: `resume` (file), `jobDescription` (text) → `AnalysisResult` JSON (see `lib/types.ts`)
- `POST /api/export` — JSON `{ resume: ResumeSections }` → `application/pdf`

## Deployment (Vercel)

1. Push this folder to a GitHub repo.
2. Import it in Vercel — Next.js is auto-detected.
3. Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`) in Project → Settings → Environment Variables.
4. Deploy. `maxDuration = 60` is set on the analyze route; on the Hobby plan keep JDs reasonable or upgrade if you hit timeouts.

## Limitations / roadmap

- No OCR for scanned resumes (deliberately out of scope; would add Tesseract or a vision model).
- English-optimized prompts; other languages work but scoring bands are tuned for English.
- Exported PDF uses one clean single-column template (which is also what ATS parsers handle best).
