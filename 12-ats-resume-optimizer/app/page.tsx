"use client"

import { useState } from "react"
import type { AnalysisResult, BulletRewrite, ResumeSections } from "@/lib/types"

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [jd, setJd] = useState("")
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  async function analyze() {
    if (!file) {
      setError("Attach your resume (.pdf or .docx) first.")
      return
    }
    if (!jd.trim()) {
      setError("Paste the job description first.")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append("resume", file)
      form.append("jobDescription", jd)
      const res = await fetch("/api/analyze", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Analysis failed.")
      setResult(data as AnalysisResult)
      setAccepted(new Set((data as AnalysisResult).rewrites.map((_, i) => i)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.")
    } finally {
      setLoading(false)
    }
  }

  function toggleRewrite(i: number) {
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function applyRewrites(
    resume: ResumeSections,
    rewrites: BulletRewrite[],
    acceptedSet: Set<number>,
  ): ResumeSections {
    const copy: ResumeSections = JSON.parse(JSON.stringify(resume))
    rewrites.forEach((r, i) => {
      if (!acceptedSet.has(i)) return
      for (const exp of copy.experience) {
        const idx = exp.bullets.indexOf(r.original)
        if (idx !== -1) {
          exp.bullets[idx] = r.rewrite
          break
        }
      }
    })
    return copy
  }

  async function exportPdf() {
    if (!result) return
    setExporting(true)
    setError(null)
    try {
      const optimized = applyRewrites(result.resume, result.rewrites, accepted)
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: optimized }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Export failed.")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "resume-optimized.pdf"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>ATS Resume Optimizer</h1>
        <p>
          Upload your resume, paste a job description, and get a semantic match
          score, keyword gap analysis, and honest bullet rewrites — no invented
          metrics, ever.
        </p>
      </div>

      <div className="grid">
        <div className="card">
          <h2>1. Your resume</h2>
          <label className="dropzone">
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span className="filename">{file.name}</span>
            ) : (
              <span>
                Click to choose a <strong>.pdf</strong> or <strong>.docx</strong>
                <br />
                (max 8 MB)
              </span>
            )}
          </label>
        </div>

        <div className="card">
          <h2>2. Job description</h2>
          <textarea
            placeholder="Paste the full job posting here…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />
        </div>
      </div>

      <div className="actions">
        <button onClick={analyze} disabled={loading}>
          {loading ? "Analyzing… (15–30s)" : "Analyze match"}
        </button>
        {error && <span className="error">{error}</span>}
      </div>

      {result && (
        <div className="results">
          {result.warnings.length > 0 && (
            <div className="card">
              <h2>Heads up</h2>
              {result.warnings.map((w, i) => (
                <div key={i} className={`warning-item ${w.severity}`} style={{ marginBottom: 8 }}>
                  <span>{w.severity === "error" ? "⛔" : w.severity === "warning" ? "⚠️" : "ℹ️"}</span>
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h2>Match score</h2>
            <div className="score-layout">
              <div className="score-big">
                <div className="num">{result.overallScore}</div>
                <div className="label">out of 100</div>
                <div className="score-sub">
                  semantic fit {result.embeddingScore} · keyword coverage {result.keywordCoverage}%
                </div>
              </div>
              <div>
                {result.sectionScores.map((s) => (
                  <div key={s.section} className="bar-row">
                    <div className="bar-head">
                      <span>{s.section}</span>
                      <span>{s.score}</span>
                    </div>
                    <div className="bar">
                      <div style={{ width: `${s.score}%` }} />
                    </div>
                    <div className="bar-rationale">{s.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Keyword gap analysis</h2>
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Importance</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.keywordGaps.map((g, i) => (
                  <tr key={i}>
                    <td>{g.term}</td>
                    <td>
                      <span className={`pill ${g.importance}`}>{g.importance}</span>
                    </td>
                    <td className={g.presentInResume ? "present" : "missing"}>
                      {g.presentInResume ? "Present" : "Missing"}
                    </td>
                    <td>
                      {g.presentInResume
                        ? g.evidence
                        : g.suggestion ?? (
                            <span className="hint">
                              No honest way to add this — your resume shows no supporting
                              experience. Consider building it before claiming it.
                            </span>
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Bullet rewrites ({result.rewrites.length})</h2>
            {result.rewrites.length === 0 && (
              <p className="hint">No weak bullets found — your bullets are already strong.</p>
            )}
            {result.rewrites.map((r, i) => (
              <div key={i} className="rewrite-item">
                <div className="issues">
                  {r.issues.map((issue, j) => (
                    <span key={j} className="issue-tag">{issue}</span>
                  ))}
                </div>
                <div className="before">{r.original}</div>
                <div className="after">{r.rewrite}</div>
                <label>
                  <input
                    type="checkbox"
                    checked={accepted.has(i)}
                    onChange={() => toggleRewrite(i)}
                  />
                  Include this rewrite in the exported PDF
                </label>
              </div>
            ))}
            <div className="actions">
              <button onClick={exportPdf} disabled={exporting}>
                {exporting ? "Building PDF…" : "Export optimized resume (PDF)"}
              </button>
              <span className="hint">
                Applies the {accepted.size} accepted rewrite{accepted.size === 1 ? "" : "s"} —
                remember to replace [placeholders] with your real numbers.
              </span>
            </div>
          </div>

          <p className="footer-note">
            Honesty guarantee: this tool never invents experience, skills, or metrics.
            Placeholders like [X%] mark where your real numbers belong.
          </p>
        </div>
      )}
    </main>
  )
}
