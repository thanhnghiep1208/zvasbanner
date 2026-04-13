import { NextResponse } from "next/server";

import {
  buildEnhanceMetaPrompt,
  getGeminiApiKey,
  runGeminiEnhance,
} from "@/lib/gemini-server";
import { parseEnhancePromptBody } from "@/lib/validate-generation";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = parseEnhancePromptBody(body);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Invalid body. Expected { userPrompt: string, canvasConfig, assets: UploadedAsset[] }",
      },
      { status: 400 }
    );
  }

  let apiKey: string;
  try {
    apiKey = getGeminiApiKey();
  } catch {
    return NextResponse.json(
      { error: "Server is not configured with GEMINI_API_KEY" },
      { status: 500 }
    );
  }

  const meta = buildEnhanceMetaPrompt(
    parsed.userPrompt,
    parsed.canvasConfig,
    parsed.assets
  );

  try {
    const enhancedPrompt = await runGeminiEnhance(apiKey, meta);
    return NextResponse.json({ enhancedPrompt });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isTimeout =
      message.includes("timed out") ||
      message.includes("timeout") ||
      (e instanceof Error && e.name === "AbortError");

    return NextResponse.json(
      { error: message || "Enhancement failed" },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
