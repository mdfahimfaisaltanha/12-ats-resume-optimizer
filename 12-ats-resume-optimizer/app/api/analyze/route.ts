import { NextResponse } from "next/server"
import { keywordGapAnalysis, rewriteBullets } from "@/lib/analysis"
import { extractText } from "@/lib/parse/extractText"
import { structureResume } from "@/lib/parse/structure"
import { blendScores, keywordCoverage, scoreMatch } from "@/lib/scoring"
import type { AnalysisResult, ParseWarning } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_FILE_BYTES = 8 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("resume")
    const jobDescription = String(form.get("jobDescription") ?? "").trim()

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach a resume file (.pdf or .docx)." }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 8 MB)." }, { status: 400 })
    }
    if (!jobDescription) {
      return NextResponse.json({ error: "Paste a job description." }, { status: 400 })
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server is missing OPENAI_API_KEY. Copy .env.example to .env.local and set your key." },
        { status: 500 },
      )
    }

    const warnings: ParseWarning[] = []

    // Edge case: extremely short / vague job descriptions produce unreliable
    // scores — we proceed but tell the user exactly why to be skeptical.
    if (jobDescription.length < 300) {
      warnings.push({
        code: "SHORT_JOB_DESCRIPTION",
        severity: "warning",
        message:
          "This job description is very short, so match scores and keyword analysis will be less reliable. Paste the full posting if you have it.",
      })
    }

    // 1. Extract raw text
    const buffer = Buffer.from(await file.arrayBuffer())
    const extraction = await extractText(buffer, file.name)
    warnings.push(...extraction.warnings)

    // Edge case: scanned/image PDFs — stop with a clear message instead of
    // silently analyzing garbage.
    if (extraction.text.length < 100 || extraction.warnings.some((w) => w.severity === "error")) {
      return NextResponse.json(
        {
          error:
            "Could not extract usable text from this file. It looks like a scanned image or an empty document.",
          warnings,
        },
        { status: 422 },
      )
    }

    // 2. Structure into sections (LLM-based, honesty-constrained)
    const structured = await structureResume(extraction.text)
    warnings.push(...structured.warnings)

    // 3. Score + analyze in parallel (independent calls)
    const [scores, gaps, rewrites] = await Promise.all([
      scoreMatch(structured.resume, jobDescription),
      keywordGapAnalysis(structured.resume, jobDescription),
      rewriteBullets(structured.resume, jobDescription),
    ])

    const coverage = keywordCoverage(gaps)
    const overallScore = blendScores(scores.embeddingScore, coverage)

    const result: AnalysisResult = {
      warnings,
      resume: structured.resume,
      overallScore,
      embeddingScore: scores.embeddingScore,
      keywordCoverage: Math.round(coverage * 100),
      sectionScores: scores.sectionScores,
      keywordGaps: gaps,
      rewrites,
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed unexpectedly."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
