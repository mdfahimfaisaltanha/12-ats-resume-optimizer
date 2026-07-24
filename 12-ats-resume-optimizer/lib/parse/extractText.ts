import mammoth from "mammoth"
import type { ParseWarning } from "@/lib/types"

export type ExtractResult = {
  text: string
  pageCount: number | null
  warnings: ParseWarning[]
}

/**
 * Extract raw text from a PDF or DOCX buffer.
 *
 * Edge cases handled:
 * - Scanned/image PDFs yield almost no selectable text -> LOW_TEXT_YIELD error
 *   warning so the caller can stop instead of producing garbage output.
 * - Multi-column / table-heavy layouts produce fragmented lines ->
 *   LAYOUT_ARTIFACTS warning so the user knows parsing quality may suffer.
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
): Promise<ExtractResult> {
  const lower = filename.toLowerCase()
  const warnings: ParseWarning[] = []

  if (lower.endsWith(".pdf")) {
    // Import the implementation file directly: the package root of pdf-parse
    // runs debug code on import that breaks in bundled server environments.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default
    const data = await pdfParse(buffer)
    const text = normalize(data.text || "")
    const pageCount = data.numpages ?? null

    if (pageCount && text.length / pageCount < 200) {
      warnings.push({
        code: "LOW_TEXT_YIELD",
        severity: "error",
        message:
          "This PDF contains very little selectable text — it is likely a scanned image or an export that flattened the text. Upload a text-based PDF or DOCX instead.",
      })
    }
    detectLayoutArtifacts(text, warnings)
    return { text, pageCount, warnings }
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer })
    const text = normalize(result.value || "")
    detectLayoutArtifacts(text, warnings)
    return { text, pageCount: null, warnings }
  }

  throw new Error("Unsupported file type. Upload a .pdf or .docx resume.")
}

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t\u00a0]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Heuristic detection of multi-column or table-based layouts, which extract
 * as fragmented text. We warn rather than silently producing garbage.
 */
function detectLayoutArtifacts(text: string, warnings: ParseWarning[]) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0)
  if (lines.length < 10) return

  const tinyLines = lines.filter((l) => l.trim().length <= 3).length
  const gapLines = lines.filter((l) => / {4,}/.test(l.trim())).length

  if (tinyLines / lines.length > 0.25 || gapLines / lines.length > 0.3) {
    warnings.push({
      code: "LAYOUT_ARTIFACTS",
      severity: "warning",
      message:
        "This resume appears to use a multi-column or table-based layout. Text extraction may be out of order, which can reduce parsing and scoring accuracy. A single-column layout parses best (and is also what most real ATS systems prefer).",
    })
  }
}
