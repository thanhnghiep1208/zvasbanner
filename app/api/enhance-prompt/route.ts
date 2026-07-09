import { NextResponse } from "next/server";

import { requirePermissionJson } from "@/lib/require-user";
import {
  buildEnhanceMetaPrompt,
  getGeminiApiKey,
  runGeminiEnhance,
} from "@/lib/gemini-server";
import { parseEnhancePromptBody } from "@/lib/validate-generation";
import { createRateLimiter, readJsonWithSizeLimit } from "@/lib/request-limits";

export const maxDuration = 60;

// Body can carry asset data URLs for context, same scale as /api/generate.
const MAX_REQUEST_BODY_BYTES = 30 * 1024 * 1024;

const checkRateLimit = createRateLimiter(20, 60 * 60 * 1000); // 20 req/hr/user

function normalizeEnhanceError(raw: string): { message: string; status: number } {
  const msg = raw.toLowerCase();

  if (
    msg.includes("api key") ||
    msg.includes("unauthenticated") ||
    msg.includes("permission denied")
  ) {
    return {
      status: 502,
      message:
        "Không thể xác thực với Gemini API khi cải thiện prompt. Vui lòng kiểm tra API key/quyền truy cập.",
    };
  }

  if (
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("resource exhausted")
  ) {
    return {
      status: 429,
      message:
        "Gemini API đang chạm giới hạn quota/rate limit khi cải thiện prompt. Vui lòng thử lại sau ít phút.",
    };
  }

  if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("deadline")) {
    return {
      status: 504,
      message:
        "Yêu cầu cải thiện prompt đã bị timeout do phản hồi Gemini quá chậm. Vui lòng thử lại.",
    };
  }

  return {
    status: 502,
    message:
      "Không thể cải thiện prompt do lỗi từ Gemini API. Vui lòng thử lại.",
  };
}

export async function POST(request: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để cải thiện prompt.",
    forbiddenError: "Bạn không có quyền dùng tính năng tạo ảnh.",
    permission: "generate_image",
  });
  if (authGate instanceof NextResponse) return authGate;

  if (!checkRateLimit(authGate.userId)) {
    return NextResponse.json(
      { error: "Bạn đã cải thiện prompt quá nhiều lần trong 1 giờ. Vui lòng thử lại sau." },
      { status: 429 }
    );
  }

  const bodyResult = await readJsonWithSizeLimit(request, MAX_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status });
  }

  const parsed = parseEnhancePromptBody(bodyResult.body);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Dữ liệu chưa hợp lệ. Cần có userPrompt, canvasConfig và assets.",
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
    const normalized = normalizeEnhanceError(message);
    console.error("[enhance-prompt] gemini enhance failed", message);

    return NextResponse.json({ error: normalized.message }, { status: normalized.status });
  }
}
