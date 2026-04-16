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

function normalizeGenerationError(raw: string): {
  userMessage: string;
  errorCode: string;
} {
  const msg = raw.toLowerCase();

  if (
    msg.includes("api key") ||
    msg.includes("unauthenticated") ||
    msg.includes("permission denied")
  ) {
    return {
      errorCode: "GEMINI_AUTH_ERROR",
      userMessage:
        "Không thể xác thực với Gemini API. Vui lòng kiểm tra GEMINI_API_KEY hoặc quyền truy cập model.",
    };
  }

  if (
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("resource exhausted")
  ) {
    return {
      errorCode: "GEMINI_QUOTA_OR_RATE_LIMIT",
      userMessage:
        "Gemini API đã chạm giới hạn quota/rate limit. Vui lòng đợi vài phút rồi thử lại.",
    };
  }

  if (msg.includes("timed out") || msg.includes("deadline")) {
    return {
      errorCode: "GEMINI_TIMEOUT",
      userMessage:
        "Gemini phản hồi quá chậm và đã bị timeout. Vui lòng thử lại hoặc rút gọn prompt/tài sản upload.",
    };
  }

  if (msg.includes("no image data")) {
    return {
      errorCode: "GEMINI_EMPTY_IMAGE",
      userMessage:
        "Gemini đã trả phản hồi nhưng không có dữ liệu ảnh hợp lệ. Vui lòng thử lại với prompt rõ hơn.",
    };
  }

  if (msg.includes("invalid") || msg.includes("bad request")) {
    return {
      errorCode: "GEMINI_INVALID_REQUEST",
      userMessage:
        "Yêu cầu gửi đến Gemini chưa hợp lệ (prompt hoặc dữ liệu ảnh đính kèm). Vui lòng kiểm tra nội dung và thử lại.",
    };
  }

  return {
    errorCode: "GEMINI_UNKNOWN_ERROR",
    userMessage:
      "Không thể tạo ảnh từ Gemini do lỗi không xác định. Vui lòng thử lại sau.",
  };
}

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
  errorCode?: string;
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
    const normalized = normalizeGenerationError(reason);
    return {
      image: buildPlaceholderDataUrl(width, height),
      source: "placeholder",
      meta: {
        model: "gemini-3.1-flash-image-preview",
        elapsedMs: Date.now() - startedAt,
      },
      failedStep: "gemini-3.1-flash-image-preview",
      errorCode: normalized.errorCode,
      placeholderError: `${normalized.userMessage} (Chi tiết kỹ thuật: ${reason})`,
    };
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON không hợp lệ. Vui lòng kiểm tra dữ liệu gửi lên." },
      { status: 400 }
    );
  }

  const parsed = parseGenerateApiBody(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Dữ liệu tạo ảnh không hợp lệ (GenerationRequest)." },
      { status: 400 }
    );
  }

  let apiKey: string;
  try {
    apiKey = getGeminiApiKey();
  } catch {
    return NextResponse.json(
      {
        error:
          "Server chưa cấu hình GEMINI_API_KEY nên không thể gọi Gemini API.",
      },
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
    errorCode: one.errorCode,
    placeholderError: one.placeholderError,
  });
}
