import { NextResponse } from "next/server";

import {
  buildPlaceholderDataUrl,
  getGeminiApiKey,
  imagenGenerateOne,
  inferImagenAspectRatio,
} from "@/lib/gemini-server";
import { assembleFullPrompt, type VariationIndex } from "@/lib/prompt-builder";
import type { GenerationRequest } from "@/lib/types";
import { parseGenerateApiBody } from "@/lib/validate-generation";

export const maxDuration = 60;

const VARIATIONS: VariationIndex[] = [0, 1, 2];

async function generateOneVariation(
  apiKey: string,
  request: GenerationRequest,
  variationIndex: VariationIndex,
  aspectRatio: string,
  width: number,
  height: number
): Promise<string> {
  const fullPrompt = assembleFullPrompt(request, variationIndex);
  try {
    return await imagenGenerateOne(apiKey, fullPrompt, aspectRatio);
  } catch {
    return buildPlaceholderDataUrl(width, height);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = parseGenerateApiBody(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid GenerationRequest body" },
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

  const { request, regenerateVariationIndex, existingVariations } = parsed;
  const { width, height } = request.canvasConfig;
  const aspectRatio = inferImagenAspectRatio(width, height);

  if (
    regenerateVariationIndex !== undefined &&
    existingVariations !== undefined
  ) {
    const merged: [string, string, string] = [...existingVariations];
    merged[regenerateVariationIndex] = await generateOneVariation(
      apiKey,
      request,
      regenerateVariationIndex,
      aspectRatio,
      width,
      height
    );
    return NextResponse.json({ variations: merged });
  }

  const variations = await Promise.all(
    VARIATIONS.map((i) =>
      generateOneVariation(apiKey, request, i, aspectRatio, width, height)
    )
  );

  return NextResponse.json({ variations });
}
