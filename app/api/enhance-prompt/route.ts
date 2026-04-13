import { NextResponse } from "next/server";

/** Stub: replace with Gemini (or other) enhancement later. */
export async function POST(req: Request) {
  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt : "";
  } catch {
    /* empty body */
  }

  console.log("[api/enhance-prompt stub]", {
    length: prompt.length,
    preview: prompt.slice(0, 120),
  });

  const trimmed = prompt.trim();
  const enhancedPrompt = trimmed
    ? `[Stub enhanced] ${trimmed}${trimmed.length > 400 ? "" : " — bổ sung chi tiết ánh sáng, bố cục và CTA rõ ràng hơn."}`
    : "";

  return NextResponse.json({ enhancedPrompt });
}
