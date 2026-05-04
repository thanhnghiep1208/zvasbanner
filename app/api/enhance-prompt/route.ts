import { NextResponse } from "next/server";

import { requireUserJson } from "@/lib/require-user";
import {
  buildEnhanceMetaPrompt,
  getGeminiApiKey,
  runGeminiEnhance,
} from "@/lib/gemini-server";
import { parseEnhancePromptBody } from "@/lib/validate-generation";

export const maxDuration = 60;

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
  const authGate = await requireUserJson({
    error: "Cần đăng nhập để cải thiện prompt.",
  });
  if (authGate instanceof NextResponse) return authGate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON không hợp lệ. Vui lòng kiểm tra dữ liệu gửi lên." },
      { status: 400 }
    );
  }

  const parsed = parseEnhancePromptBody(body);
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

    return NextResponse.json(
      {
        error: `${normalized.message} (Chi tiết kỹ thuật: ${
          message || "Enhancement failed"
        })`,
      },
      { status: normalized.status }
    );
  }
}
