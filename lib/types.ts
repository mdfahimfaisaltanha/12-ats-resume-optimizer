export type ContactInfo = {
  name: string
  email: string
  phone: string
  location: string
  links: string[]
}

export type ExperienceItem = {
  company: string
  title: string
  startDate: string
  endDate: string
  bullets: string[]
}

export type EducationItem = {
  institution: string
  degree: string
  dates: string
}

export type ResumeSections = {
  contact: ContactInfo
  summary: string
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: string[]
  other: string
}

export type ParseWarning = {
  code:
    | "LOW_TEXT_YIELD"
    | "LAYOUT_ARTIFACTS"
    | "MISSING_SECTION"
    | "NO_METRICS"
    | "SHORT_JOB_DESCRIPTION"
    | "PARSE_FALLBACK"
  severity: "info" | "warning" | "error"
  message: string
}

export type SectionScore = {
  section: string
  score: number
  rationale: string
}

export type KeywordGap = {
  term: string
  importance: "high" | "medium" | "low"
  presentInResume: boolean
  evidence: string
  suggestion: string | null
}

export type BulletRewrite = {
  original: string
  issues: string[]
  rewrite: string
}

export type AnalysisResult = {
  warnings: ParseWarning[]
  resume: ResumeSections
  overallScore: number
  embeddingScore: number
  keywordCoverage: number
  sectionScores: SectionScore[]
  keywordGaps: KeywordGap[]
  rewrites: BulletRewrite[]
}
