import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib"
import type { ResumeSections } from "@/lib/types"

const PAGE_WIDTH = 612 // US Letter
const PAGE_HEIGHT = 792
const MARGIN = 54
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const INK = rgb(0.12, 0.12, 0.14)
const MUTED = rgb(0.4, 0.4, 0.45)
const LINE = rgb(0.75, 0.75, 0.78)

/**
 * Render a structured resume to a clean, single-column, ATS-friendly PDF
 * using only standard fonts (no font files needed — serverless-safe).
 */
export async function buildResumePdf(resume: ResumeSections): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique)

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
  }

  const drawWrapped = (
    text: string,
    f: PDFFont,
    size: number,
    color = INK,
    indent = 0,
    lineGap = 3,
  ) => {
    const lines = wrapText(text, f, size, CONTENT_WIDTH - indent)
    for (const line of lines) {
      ensureSpace(size + lineGap)
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font: f, color })
      y -= size + lineGap
    }
  }

  const sectionHeading = (label: string) => {
    ensureSpace(30)
    y -= 12
    page.drawText(label.toUpperCase(), {
      x: MARGIN,
      y: y - 11,
      size: 11,
      font: bold,
      color: INK,
    })
    y -= 16
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.7,
      color: LINE,
    })
    y -= 8
  }

  // --- Header ---
  if (resume.contact.name) {
    drawWrapped(resume.contact.name, bold, 20, INK, 0, 4)
  }
  const contactLine = [
    resume.contact.email,
    resume.contact.phone,
    resume.contact.location,
    ...resume.contact.links,
  ]
    .filter(Boolean)
    .join("  •  ")
  if (contactLine) drawWrapped(contactLine, font, 9.5, MUTED, 0, 3)

  // --- Summary ---
  if (resume.summary) {
    sectionHeading("Summary")
    drawWrapped(resume.summary, font, 10.5)
  }

  // --- Skills ---
  if (resume.skills.length > 0) {
    sectionHeading("Skills")
    drawWrapped(resume.skills.join("  •  "), font, 10.5)
  }

  // --- Experience ---
  if (resume.experience.length > 0) {
    sectionHeading("Experience")
    for (const exp of resume.experience) {
      ensureSpace(34)
      const title = [exp.title, exp.company].filter(Boolean).join(" — ")
      drawWrapped(title, bold, 11.5, INK, 0, 2)
      const dates = [exp.startDate, exp.endDate].filter(Boolean).join(" – ")
      if (dates) drawWrapped(dates, oblique, 9.5, MUTED, 0, 4)
      for (const b of exp.bullets) {
        drawWrapped(`•  ${b}`, font, 10.5, INK, 10)
      }
      y -= 6
    }
  }

  // --- Education ---
  if (resume.education.length > 0) {
    sectionHeading("Education")
    for (const edu of resume.education) {
      const line = [edu.degree, edu.institution].filter(Boolean).join(" — ")
      drawWrapped(line, bold, 10.5, INK, 0, 2)
      if (edu.dates) drawWrapped(edu.dates, oblique, 9.5, MUTED, 0, 4)
      y -= 2
    }
  }

  // --- Other ---
  if (resume.other) {
    sectionHeading("Additional")
    drawWrapped(resume.other, font, 10.5)
  }

  return doc.save()
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const sanitized = text.replace(/\s+/g, " ").trim()
  if (!sanitized) return []
  const words = sanitized.split(" ")
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}
