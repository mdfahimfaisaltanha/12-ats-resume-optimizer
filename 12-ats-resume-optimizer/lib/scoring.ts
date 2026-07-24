import { cosine, embed } from "@/lib/llm"
import { resumeToText } from "@/lib/parse/structure"
import type { ResumeSections, SectionScore } from "@/lib/types"

/**
 * Rescale raw cosine similarity to a 0–100 score.
 *
 * With text-embedding-3-small, unrelated professional documents typically
 * score ~0.15–0.25 cosine similarity and strong resume/JD matches ~0.6–0.75.
 * A raw cosine would therefore compress every result into a misleading
 * middle band. We linearly map [0.20, 0.75] -> [0, 100] and clamp.
 * These bounds are documented in the README and easy to tune.
 */
export function rescaleCosine(c: number): number {
  const scaled = (c - 0.2) / 0.55
  return Math.round(100 * Math.max(0, Math.min(1, scaled)))
}

export type EmbeddingScores = {
  embeddingScore: number
  sectionScores: SectionScore[]
}

/**
 * Semantic match scoring: embed the JD, the full resume, and each resume
 * section, then compare each against the JD with cosine similarity.
 * One batched embeddings call keeps latency and cost low.
 */
export async function scoreMatch(
  resume: ResumeSections,
  jobDescription: string,
): Promise<EmbeddingScores> {
  const sections: { name: string; text: string; rationale: string }[] = []

  if (resume.summary) {
    sections.push({
      name: "Summary",
      text: resume.summary,
      rationale: "How well your professional summary aligns with what this role is about.",
    })
  }
  if (resume.skills.length > 0) {
    sections.push({
      name: "Skills",
      text: resume.skills.join(", "),
      rationale: "Semantic overlap between your listed skills and the role's requirements.",
    })
  }
  if (resume.experience.length > 0) {
    sections.push({
      name: "Experience",
      text: resume.experience
        .map((e) => `${e.title} at ${e.company}. ${e.bullets.join(" ")}`)
        .join("\n"),
      rationale: "How closely your actual work history matches the responsibilities described.",
    })
  }
  if (resume.education.length > 0) {
    sections.push({
      name: "Education",
      text: resume.education.map((e) => `${e.degree}, ${e.institution}`).join("; "),
      rationale: "Alignment of your education with any stated requirements.",
    })
  }

  const inputs = [jobDescription, resumeToText(resume), ...sections.map((s) => s.text)]
  const vectors = await embed(inputs)
  const jdVec = vectors[0]

  const embeddingScore = rescaleCosine(cosine(jdVec, vectors[1]))
  const sectionScores: SectionScore[] = sections.map((s, i) => ({
    section: s.name,
    score: rescaleCosine(cosine(jdVec, vectors[i + 2])),
    rationale: s.rationale,
  }))

  return { embeddingScore, sectionScores }
}

/**
 * Weighted keyword coverage: high-importance terms count 3x, medium 2x, low 1x.
 * Returns a 0–1 fraction.
 */
export function keywordCoverage(
  gaps: { importance: "high" | "medium" | "low"; presentInResume: boolean }[],
): number {
  const weight = { high: 3, medium: 2, low: 1 } as const
  let total = 0
  let covered = 0
  for (const g of gaps) {
    total += weight[g.importance]
    if (g.presentInResume) covered += weight[g.importance]
  }
  return total === 0 ? 0 : covered / total
}

/**
 * Final blended score. Embeddings capture semantic fit even when wording
 * differs; keyword coverage captures the literal term matching real ATS
 * filters perform. 60/40 blend, documented in the README.
 */
export function blendScores(embeddingScore: number, coverage: number): number {
  return Math.round(0.6 * embeddingScore + 0.4 * coverage * 100)
}
