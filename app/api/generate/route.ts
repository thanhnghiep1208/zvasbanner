import { NextResponse } from "next/server";

import {
  buildPlaceholderDataUrl,
  geminiGenerateOneImage,
  getGeminiApiKey,
  type ImageGenerationMeta,
} from "@/lib/gemini-server";
import { assembleFullPrompt } from "@/lib/prompt-builder";
import type { GenerationRequest } from "@/lib/types";
import { parseGenerateApiBody } from "@/lib/validate-generation";

export const maxDuration = 60;

const ASSET_PRIORITY_TIMEOUT_MS = 45_000;

function withEarlyTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function generateOneVariation(
  apiKey: string,
  request: GenerationRequest,
  width: number,
  height: number
): Promise<{
  image: string;
  source: "gemini" | "placeholder";
  meta?: ImageGenerationMeta;
  placeholderError?: string;
  failedStep?: string;
}> {
  const styleRefCount = request.assets.filter(
    (a) => a.role === "style-reference"
  ).length;
  const styleLockInstruction =
    styleRefCount > 0
      ? "\n\nSTYLE-REFERENCE LOCK (HIGH PRIORITY): Match the uploaded style-reference assets first: replicate their palette relationships, gradient behavior, grain/noise character, and graphic element language. Keep this styling consistent across the whole banner. Do not copy literal text or logos."
      : "";
  const fullPrompt = assembleFullPrompt(request) + styleLockInstruction;
  const startedAt = Date.now();
  try {
    const generated = await withEarlyTimeout(
      geminiGenerateOneImage(apiKey, fullPrompt, request.assets),
      ASSET_PRIORITY_TIMEOUT_MS,
      "Gemini image"
    );
    return { image: generated.image, source: "gemini", meta: generated.meta };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      image: buildPlaceholderDataUrl(width, height),
      source: "placeholder",
      meta: {
        model: "gemini-3.1-flash-image-preview",
        elapsedMs: Date.now() - startedAt,
      },
      failedStep: "gemini-3.1-flash-image-preview",
      placeholderError: `Model generation failed at step gemini-3.1-flash-image-preview: ${reason}`,
    };
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

  const { request } = parsed;
  const { width, height } = request.canvasConfig;
  const one = await generateOneVariation(apiKey, request, width, height);
  return NextResponse.json({
    image: one.image,
    source: one.source,
    meta: one.meta,
    failedStep: one.failedStep,
    placeholderError: one.placeholderError,
  });
}
