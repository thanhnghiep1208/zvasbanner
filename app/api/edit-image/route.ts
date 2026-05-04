import { NextResponse } from "next/server";

import { requireUserJson } from "@/lib/require-user";
import {
  geminiGenerateOneImage,
  getGeminiApiKey,
  type ImageGenerationMeta,
} from "@/lib/gemini-server";
import { parseCanvasConfig } from "@/lib/validate-generation";

export const maxDuration = 60;

const EDIT_TIMEOUT_MS = 45_000;

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

function buildEditPrompt(editPrompt: string, canvasText: string): string {
  return [
    "You are editing an existing generated banner image.",
    "IMPORTANT: Keep the same core subject, same overall composition, and same scene identity.",
    "Do NOT create a brand-new design from scratch.",
    "Only apply limited edits requested by the user, mainly:",
    "- adjust object position/layout subtly,",
    "- adjust rotation/angle subtly,",
    "- adjust basic colors, tone, or contrast.",
    "Preserve readability and production quality.",
    canvasText,
    "",
    `User edit request: ${editPrompt.trim()}`,
  ].join("\n");
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
  const authGate = await requireUserJson({
    error: "Cần đăng nhập để chỉnh sửa ảnh.",
  });
  if (authGate instanceof NextResponse) return authGate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON không hợp lệ. Vui lòng kiểm tra dữ liệu gửi lên." },
      { status: 400 }
    );
  }

  const parsed = parseEditImageBody(body);
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
  const canvasText = canvasConfig
    ? `Target canvas: ${canvasConfig.width}x${canvasConfig.height} (${canvasConfig.platform} - ${canvasConfig.name}).`
    : "Target canvas: keep original image ratio and framing.";
  const prompt = buildEditPrompt(parsed.editPrompt, canvasText);
  const startedAt = Date.now();

  try {
    const generated = await withTimeout(
      geminiGenerateOneImage(apiKey, prompt, [
        {
          id: "generated-base-image",
          url: "generated-base-image",
          dataUrl: parsed.imageDataUrl,
          fileName: "generated-base-image.png",
          role: "image",
          hasAlpha: false,
          originalDims: {
            width: canvasConfig?.width ?? 0,
            height: canvasConfig?.height ?? 0,
          },
        },
      ]),
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
    const meta: ImageGenerationMeta = {
      model: "gemini-3.1-flash-image-preview",
      elapsedMs: Date.now() - startedAt,
    };
    return NextResponse.json(
      {
        error: `[${mapped.errorCode}] ${mapped.userMessage} (Chi tiết kỹ thuật: ${reason})`,
        errorCode: mapped.errorCode,
        source: "error",
        meta,
      },
      { status: 502 }
    );
  }
}
