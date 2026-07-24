import { chatJson } from "@/lib/llm"
import type {
  EducationItem,
  ExperienceItem,
  ParseWarning,
  ResumeSections,
} from "@/lib/types"

const SYSTEM = `You are a precise resume parser. You convert raw resume text into structured JSON.
Rules:
- Copy content VERBATIM from the source text. Never invent, embellish, or infer information that is not present.
- If a field is absent, use an empty string "" (or an empty array for lists).
- Bullets are individual achievement/responsibility lines under a job. Strip leading bullet characters (•, -, *).
- Put any content that does not fit the schema (certifications, projects, awards) into "other" as plain text.`

function buildUserPrompt(text: string): string {
  return `Parse this resume into JSON with EXACTLY this shape:
{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "links": [] },
  "summary": "",
  "experience": [ { "company": "", "title": "", "startDate": "", "endDate": "", "bullets": [] } ],
  "education": [ { "institution": "", "degree": "", "dates": "" } ],
  "skills": [],
  "other": ""
}

RESUME TEXT:
"""
${text.slice(0, 12000)}
"""`
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : []
}

function validateResume(data: unknown): ResumeSections | null {
  if (typeof data !== "object" || data === null) return null
  const d = data as Record<string, unknown>
  const contactRaw = (d.contact ?? {}) as Record<string, unknown>

  const experience: ExperienceItem[] = Array.isArray(d.experience)
    ? d.experience
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          company: asString(e.company),
          title: asString(e.title),
          startDate: asString(e.startDate),
          endDate: asString(e.endDate),
          bullets: asStringArray(e.bullets),
        }))
        .filter((e) => e.company || e.title || e.bullets.length > 0)
    : []

  const education: EducationItem[] = Array.isArray(d.education)
    ? d.education
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          institution: asString(e.institution),
          degree: asString(e.degree),
          dates: asString(e.dates),
        }))
        .filter((e) => e.institution || e.degree)
    : []

  return {
    contact: {
      name: asString(contactRaw.name),
      email: asString(contactRaw.email),
      phone: asString(contactRaw.phone),
      location: asString(contactRaw.location),
      links: asStringArray(contactRaw.links),
    },
    summary: asString(d.summary),
    experience,
    education,
    skills: asStringArray(d.skills),
    other: asString(d.other),
  }
}

export type StructureResult = {
  resume: ResumeSections
  warnings: ParseWarning[]
}

export async function structureResume(text: string): Promise<StructureResult> {
  const warnings: ParseWarning[] = []

  const resume = await chatJson<ResumeSections>({
    system: SYSTEM,
    user: buildUserPrompt(text),
    validate: validateResume,
  })

  if (resume.experience.length === 0) {
    warnings.push({
      code: "MISSING_SECTION",
      severity: "warning",
      message:
        "No work experience section could be identified. If your resume has one, its formatting may be confusing the parser.",
    })
  }
  if (resume.skills.length === 0) {
    warnings.push({
      code: "MISSING_SECTION",
      severity: "warning",
      message:
        "No skills section could be identified. An explicit skills section significantly improves ATS keyword matching.",
    })
  }

  // Systemic issue detection: a resume with zero quantifiable metrics is a
  // content problem no rewrite tool should paper over with invented numbers.
  const allBullets = resume.experience.flatMap((e) => e.bullets)
  const hasMetrics = allBullets.some((b) => /\d/.test(b))
  if (allBullets.length > 0 && !hasMetrics) {
    warnings.push({
      code: "NO_METRICS",
      severity: "warning",
      message:
        "None of your experience bullets contain quantifiable metrics (numbers, percentages, amounts). This is a systemic weakness — rewrites below use [placeholders] you should fill with your real numbers. We never invent metrics for you.",
    })
  }

  return { resume, warnings }
}

/** Flatten the structured resume back to plain text (used for embeddings and keyword checks). */
export function resumeToText(resume: ResumeSections): string {
  const parts: string[] = []
  if (resume.summary) parts.push(`SUMMARY\n${resume.summary}`)
  if (resume.skills.length > 0) parts.push(`SKILLS\n${resume.skills.join(", ")}`)
  for (const exp of resume.experience) {
    parts.push(
      `${exp.title} — ${exp.company} (${exp.startDate} – ${exp.endDate})\n${exp.bullets.join("\n")}`,
    )
  }
  for (const edu of resume.education) {
    parts.push(`${edu.degree} — ${edu.institution} (${edu.dates})`)
  }
  if (resume.other) parts.push(resume.other)
  return parts.join("\n\n")
}
