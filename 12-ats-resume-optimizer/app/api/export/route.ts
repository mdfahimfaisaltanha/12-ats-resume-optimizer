import { NextResponse } from "next/server"
import { buildResumePdf } from "@/lib/pdf"
import type { ResumeSections } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { resume?: ResumeSections }
    const resume = body.resume

    if (
      !resume ||
      typeof resume !== "object" ||
      !resume.contact ||
      !Array.isArray(resume.experience) ||
      !Array.isArray(resume.education) ||
      !Array.isArray(resume.skills)
    ) {
      return NextResponse.json({ error: "Invalid resume payload." }, { status: 400 })
    }

    const pdfBytes = await buildResumePdf(resume)
    const safeName = (resume.contact.name || "resume")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName || "resume"}-optimized.pdf"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF export failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
