import { chatJson } from "@/lib/llm"
import { resumeToText } from "@/lib/parse/structure"
import type { BulletRewrite, KeywordGap, ResumeSections } from "@/lib/types"

/* ------------------------------------------------------------------ */
/* Keyword gap analysis                                                */
/* ------------------------------------------------------------------ */

const GAP_SYSTEM = `You are an expert ATS (applicant tracking system) analyst.
You extract the key skills/terms a job description screens for and check whether a resume contains them.

HONESTY RULES (critical):
- A term counts as present if the resume contains it literally OR as a clear synonym/equivalent (e.g. "Postgres" ~ "PostgreSQL").
- For missing terms, only suggest where to add the term if the candidate's EXISTING experience plausibly supports it (e.g. they used React, so "frontend development" is honest to state).
- If the resume shows no evidence of a missing skill, set "suggestion" to null. NEVER suggest fabricating experience.`

function gapPrompt(resumeText: string, jd: string): string {
  return `JOB DESCRIPTION:
"""
${jd.slice(0, 8000)}
"""

RESUME:
"""
${resumeText.slice(0, 8000)}
"""

Extract 12-20 key terms/skills from the job description and check each against the resume.
Return JSON with EXACTLY this shape:
{
  "terms": [
    {
      "term": "string — the skill/keyword from the JD",
      "importance": "high | medium | low — how central it is to this role",
      "presentInResume": true,
      "evidence": "short quote or explanation of where it appears, or empty string if absent",
      "suggestion": "if absent AND honestly supportable: one sentence on where/how to add it. Otherwise null."
    }
  ]
}`
}

function validateGaps(data: unknown): KeywordGap[] | null {
  if (typeof data !== "object" || data === null) return null
  const terms = (data as Record<string, unknown>).terms
  if (!Array.isArray(terms)) return null
  const out: KeywordGap[] = []
  for (const t of terms) {
    if (typeof t !== "object" || t === null) continue
    const r = t as Record<string, unknown>
    if (typeof r.term !== "string" || r.term.trim() === "") continue
    const importance =
      r.importance === "high" || r.importance === "medium" || r.importance === "low"
        ? r.importance
        : "medium"
    out.push({
      term: r.term.trim(),
      importance,
      presentInResume: r.presentInResume === true,
      evidence: typeof r.evidence === "string" ? r.evidence : "",
      suggestion:
        typeof r.suggestion === "string" && r.suggestion.trim() !== ""
          ? r.suggestion
          : null,
    })
  }
  return out.length > 0 ? out : null
}

export async function keywordGapAnalysis(
  resume: ResumeSections,
  jobDescription: string,
): Promise<KeywordGap[]> {
  return chatJson<KeywordGap[]>({
    system: GAP_SYSTEM,
    user: gapPrompt(resumeToText(resume), jobDescription),
    validate: validateGaps,
  })
}

/* ------------------------------------------------------------------ */
/* Bullet rewriting                                                    */
/* ------------------------------------------------------------------ */

const REWRITE_SYSTEM = `You are an expert resume writer.
You identify weak experience bullets and rewrite them to be stronger for the target role.

What makes a bullet weak: no quantifiable outcome, passive voice, vague verbs ("responsible for", "helped with", "worked on"), listing duties instead of achievements.

HONESTY RULES (critical):
- Preserve the factual content of each bullet. You may reword, restructure, and emphasize, but NEVER add accomplishments, technologies, or scope that are not in the original.
- NEVER invent numbers. If a metric would strengthen the bullet, insert a bracketed placeholder like "[X%]" or "[N users]" for the candidate to fill in with their real figure.
- "original" must be copied VERBATIM from the input so it can be matched programmatically.`

function rewritePrompt(bullets: string[], jd: string): string {
  return `TARGET JOB DESCRIPTION (for tone/emphasis only — do not import requirements into bullets):
"""
${jd.slice(0, 4000)}
"""

EXPERIENCE BULLETS:
${bullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}

Identify up to 8 of the weakest bullets and rewrite them.
Return JSON with EXACTLY this shape:
{
  "rewrites": [
    {
      "original": "verbatim copy of the original bullet",
      "issues": ["short issue labels, e.g. 'no metric', 'passive voice', 'vague verb'"],
      "rewrite": "the improved bullet (placeholders in [brackets] where a real metric is needed)"
    }
  ]
}`
}

function validateRewrites(data: unknown): BulletRewrite[] | null {
  if (typeof data !== "object" || data === null) return null
  const rewrites = (data as Record<string, unknown>).rewrites
  if (!Array.isArray(rewrites)) return null
  const out: BulletRewrite[] = []
  for (const r of rewrites) {
    if (typeof r !== "object" || r === null) continue
    const x = r as Record<string, unknown>
    if (typeof x.original !== "string" || typeof x.rewrite !== "string") continue
    if (x.original.trim() === "" || x.rewrite.trim() === "") continue
    out.push({
      original: x.original.trim(),
      issues: Array.isArray(x.issues)
        ? x.issues.filter((i): i is string => typeof i === "string")
        : [],
      rewrite: x.rewrite.trim(),
    })
  }
  return out // empty array is a valid outcome (all bullets already strong)
}

export async function rewriteBullets(
  resume: ResumeSections,
  jobDescription: string,
): Promise<BulletRewrite[]> {
  const bullets = resume.experience.flatMap((e) => e.bullets)
  if (bullets.length === 0) return []
  return chatJson<BulletRewrite[]>({
    system: REWRITE_SYSTEM,
    user: rewritePrompt(bullets, jobDescription),
    validate: validateRewrites,
  })
}
