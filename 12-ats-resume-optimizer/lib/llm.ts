import OpenAI from "openai"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"

/**
 * Call the chat model expecting a JSON object back, validate it, and retry
 * once with the validation error fed back for self-correction.
 */
export async function chatJson<T>(opts: {
  system: string
  user: string
  validate: (data: unknown) => T | null
  retries?: number
}): Promise<T> {
  const retries = opts.retries ?? 1
  let lastError = ""

  for (let attempt = 0; attempt <= retries; attempt++) {
    const userContent =
      attempt === 0
        ? opts.user
        : `${opts.user}\n\nYour previous output was invalid (${lastError}). Return ONLY a valid JSON object matching the requested shape.`

    const res = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: userContent },
      ],
    })

    const raw = res.choices[0]?.message?.content ?? ""
    try {
      const parsed: unknown = JSON.parse(raw)
      const valid = opts.validate(parsed)
      if (valid !== null) return valid
      lastError = "JSON did not match the expected shape"
    } catch {
      lastError = "output was not parseable JSON"
    }
  }

  throw new Error(
    `The AI model returned invalid output after ${retries + 1} attempts (${lastError}).`,
  )
}

/** Embed a batch of texts. Returns one vector per input, in order. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    // Guard against empty strings, which some embedding APIs reject.
    input: texts.map((t) => (t.trim().length > 0 ? t.slice(0, 8000) : " ")),
  })
  return res.data.map((d) => d.embedding)
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}
