/**
 * POST /api/flow/generate-background – sinh nền cho Flow canvas composed mode (T4.2, SPEC 5.3, Q8A).
 * Route mới, không sửa /api/generate. Dùng chung: quyền generate_image, bộ đếm rate limit
 * (checkGenerationRateLimit, 20 lần/giờ/user cho cả hai route), giới hạn kích thước body, Gemini API key.
 */
import { NextResponse } from "next/server";

import { requirePermissionJson } from "@/lib/require-user";
import { getGeminiApiKey } from "@/lib/gemini-server";
import { checkGenerationRateLimit } from "@/lib/generation-rate-limit";
import { readJsonWithSizeLimit } from "@/lib/request-limits";
import { parseBrandKit, parseStyleControls } from "@/lib/validate-generation";
import { parseBackgroundRequestShape } from "@/lib/flow/background/request";
import { generateBackground } from "@/lib/flow-server/generate-background";

export const maxDuration = 90;

// Guide image + tối đa 10 ảnh tham chiếu (≤ 10MB/ảnh theo lib/asset-upload).
const MAX_REQUEST_BODY_BYTES = 30 * 1024 * 1024;

function friendlyError(raw: string): { status: number; errorCode: string; error: string } {
  const msg = raw.toLowerCase();
  if (msg.includes("quota") || msg.includes("rate") || msg.includes("resource exhausted")) {
    return { status: 429, errorCode: "GEMINI_QUOTA_OR_RATE_LIMIT", error: "Gemini API đã chạm giới hạn quota/rate limit. Vui lòng đợi vài phút rồi thử lại." };
  }
  if (msg.includes("503") || msg.includes("high demand") || msg.includes("unavailable")) {
    return { status: 503, errorCode: "GEMINI_HIGH_DEMAND_503", error: "Model Gemini đang quá tải tạm thời. Vui lòng thử lại sau ít phút hoặc chọn Nano Banana 2." };
  }
  if (msg.includes("timed out") || msg.includes("deadline")) {
    return { status: 504, errorCode: "GEMINI_TIMEOUT", error: "Gemini phản hồi quá chậm và đã bị timeout. Vui lòng thử lại." };
  }
  if (msg.includes("no image data")) {
    return { status: 502, errorCode: "GEMINI_EMPTY_IMAGE", error: "Gemini không trả ảnh nền. Vui lòng thử lại với brief rõ hơn." };
  }
  return { status: 502, errorCode: "GEMINI_UNKNOWN_ERROR", error: "Không thể tạo nền từ Gemini do lỗi không xác định. Vui lòng thử lại sau." };
}

export async function POST(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để tạo banner.",
    forbiddenError: "Bạn không có quyền tạo ảnh.",
    permission: "generate_image",
  });
  if (authGate instanceof NextResponse) return authGate;

  if (!checkGenerationRateLimit(authGate.userId)) {
    return NextResponse.json(
      { error: "Bạn đã tạo quá nhiều ảnh trong 1 giờ. Vui lòng thử lại sau." },
      { status: 429 }
    );
  }

  const bodyResult = await readJsonWithSizeLimit(req, MAX_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status });
  }

  const request = parseBackgroundRequestShape(bodyResult.body);
  const b = bodyResult.body as Record<string, unknown> | null;
  const styleOk = !b || b.style === undefined || parseStyleControls(b.style) !== null;
  const brandOk = !b || b.brandKit === undefined || parseBrandKit(b.brandKit) !== null;
  if (!request || !styleOk || !brandOk) {
    return NextResponse.json({ error: "Dữ liệu tạo nền không hợp lệ." }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = getGeminiApiKey();
  } catch {
    return NextResponse.json(
      { error: "Server chưa cấu hình GEMINI_API_KEY nên không thể gọi Gemini API." },
      { status: 500 }
    );
  }

  try {
    const { image, meta } = await generateBackground(apiKey, request);
    return NextResponse.json({ image, meta });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[flow/generate-background] gemini failed", raw);
    const { status, errorCode, error } = friendlyError(raw);
    return NextResponse.json({ error, errorCode }, { status });
  }
}
