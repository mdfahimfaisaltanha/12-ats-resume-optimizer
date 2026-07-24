import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "ATS Resume Optimizer",
  description:
    "AI-powered resume optimizer: semantic match scoring, keyword gap analysis, honest bullet rewriting, and PDF export.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
