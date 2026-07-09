import { NextResponse } from "next/server";

import { requirePermissionJson } from "@/lib/require-user";
import {
  geminiEditImage,
  getGeminiApiKey,
  type ImageGenerationMeta,
} from "@/lib/gemini-server";
import { parseCanvasConfig } from "@/lib/validate-generation";
import { createRateLimiter, readJsonWithSizeLimit } from "@/lib/request-limits";

export const maxDuration = 60;

const EDIT_TIMEOUT_MS = 45_000;

// A single edit request carries one base64 image + a short prompt.
const MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024;

const checkRateLimit = createRateLimiter(20, 60 * 60 * 1000); // 20 req/hr/user

type EditImageBody = {
  imageDataUrl: string;
  editPrompt: string;
  canvasConfig?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseEditImageBody(v: unknown): EditImageBody | null {
  if (!isRecord(v)) return null;
  const imageDataUrl = v.imageDataUrl;
  const editPrompt = v.editPrompt;
  if (typeof imageDataUrl !== "string" || typeof editPrompt !== "string") {
    return null;
  }
  if (!imageDataUrl.startsWith("data:image/")) return null;
  if (editPrompt.trim().length < 3) return null;
  return {
    imageDataUrl,
    editPrompt,
    canvasConfig: v.canvasConfig,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
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

function classifyEditError(message: string): { errorCode: string; userMessage: string } {
  const msg = message.toLowerCase();
  if (msg.includes("timed out")) {
    return {
      errorCode: "EDIT_TIMEOUT",
      userMessage: "Tác vụ chỉnh sửa ảnh bị timeout. Vui lòng thử lại với prompt ngắn hơn.",
    };
  }
  if (
    msg.includes("api key") ||
    msg.includes("unauthenticated") ||
    msg.includes("permission denied")
  ) {
    return {
      errorCode: "EDIT_AUTH",
      userMessage:
        "Không thể xác thực Gemini API để chỉnh sửa ảnh. Vui lòng kiểm tra cấu hình server.",
    };
  }
  if (msg.includes("quota") || msg.includes("rate") || msg.includes("resource exhausted")) {
    return {
      errorCode: "EDIT_RATE_LIMIT",
      userMessage: "Gemini API đang chạm giới hạn quota/rate limit. Vui lòng thử lại sau.",
    };
  }
  return {
    errorCode: "EDIT_UNKNOWN",
    userMessage: "Không thể chỉnh sửa ảnh do lỗi không xác định. Vui lòng thử lại.",
  };
}

export async function POST(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để chỉnh sửa ảnh.",
    forbiddenError: "Bạn không có quyền chỉnh sửa/tạo ảnh.",
    permission: "generate_image",
  });
  if (authGate instanceof NextResponse) return authGate;

  if (!checkRateLimit(authGate.userId)) {
    return NextResponse.json(
      { error: "Bạn đã chỉnh sửa quá nhiều ảnh trong 1 giờ. Vui lòng thử lại sau." },
      { status: 429 }
    );
  }

  const bodyResult = await readJsonWithSizeLimit(req, MAX_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status });
  }

  const parsed = parseEditImageBody(bodyResult.body);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Dữ liệu chỉnh sửa ảnh không hợp lệ. Cần imageDataUrl (data:image/...) và editPrompt tối thiểu 3 ký tự.",
      },
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

  const canvasConfig = parseCanvasConfig(parsed.canvasConfig);
  const startedAt = Date.now();

  try {
    const generated = await withTimeout(
      geminiEditImage(apiKey, parsed.imageDataUrl, parsed.editPrompt, {
        canvasConfig: canvasConfig ?? undefined,
      }),
      EDIT_TIMEOUT_MS,
      "Gemini edit image"
    );

    return NextResponse.json({
      image: generated.image,
      source: "gemini",
      meta: generated.meta,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const mapped = classifyEditError(reason);
    console.error("[edit-image] gemini edit failed", reason);
    const meta: ImageGenerationMeta = {
      model: "gemini-3.1-flash-image-preview",
      elapsedMs: Date.now() - startedAt,
    };
    return NextResponse.json(
      {
        error: `[${mapped.errorCode}] ${mapped.userMessage}`,
        errorCode: mapped.errorCode,
        source: "error",
        meta,
      },
      { status: 502 }
    );
  }
}
