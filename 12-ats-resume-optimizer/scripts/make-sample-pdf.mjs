// Generates samples/sample-resume.pdf from samples/sample-resume.txt so you
// can immediately test the upload flow. Run: npm run sample:pdf
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

const here = dirname(fileURLToPath(import.meta.url))
const srcPath = join(here, "..", "samples", "sample-resume.txt")
const outPath = join(here, "..", "samples", "sample-resume.pdf")

const text = readFileSync(srcPath, "utf8")

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const SIZE = 10.5
const LEADING = 15

const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)

let page = doc.addPage([PAGE_W, PAGE_H])
let y = PAGE_H - MARGIN

function wrap(line, f, size, maxWidth) {
  const words = line.split(" ")
  const out = []
  let cur = ""
  for (const w of words) {
    const cand = cur ? cur + " " + w : w
    if (f.widthOfTextAtSize(cand, size) <= maxWidth) cur = cand
    else {
      if (cur) out.push(cur)
      cur = w
    }
  }
  if (cur) out.push(cur)
  return out
}

const HEADINGS = new Set(["SUMMARY", "SKILLS", "EXPERIENCE", "EDUCATION", "PROJECTS"])

for (const rawLine of text.split("\n")) {
  const line = rawLine.trimEnd()
  if (line.trim() === "") {
    y -= LEADING * 0.6
    continue
  }
  const isHeading = HEADINGS.has(line.trim())
  const f = isHeading ? bold : font
  const size = isHeading ? 12 : SIZE
  for (const seg of wrap(line, f, size, PAGE_W - MARGIN * 2)) {
    if (y < MARGIN + LEADING) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
    page.drawText(seg, { x: MARGIN, y, size, font: f, color: rgb(0.1, 0.1, 0.12) })
    y -= LEADING
  }
}

writeFileSync(outPath, await doc.save())
console.log(`Wrote ${outPath}`)
