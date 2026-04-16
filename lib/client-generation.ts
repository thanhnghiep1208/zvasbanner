/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import { useEditorStore } from "@/store/editor";
import type { VariationProgressStatus } from "@/store/editor";

export type FullGenerationResult =
  | {
      ok: true;
      image: string;
      source: "gemini" | "placeholder";
      meta?: {
        model: string;
        elapsedMs: number;
        promptTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        costUsd?: number;
      };
      placeholderError?: string;
      failedStep?: string;
      errorCode?: string;
    }
  | { ok: false; error: string };

const CLIENT_TIMEOUT_MS = 45_000;

type GenerationUpdate = {
  status: VariationProgressStatus;
  source?: "gemini" | "placeholder";
  meta?: {
    model: string;
    elapsedMs: number;
    promptTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  };
  placeholderError?: string;
  failedStep?: string;
  errorCode?: string;
};

function explainGenerateHttpError(status: number, serverMessage?: string): string {
  const lower = (serverMessage ?? "").toLowerCase();
  const payloadTooLarge =
    status === 413 ||
    lower.includes("request entity too large") ||
    lower.includes("payload too large") ||
    lower.includes("content too large");

  if (payloadTooLarge) {
    return (
      "Ảnh tải lên quá lớn nên hệ thống không thể xử lý. " +
      "Vui lòng giảm dung lượng/kích thước ảnh (khuyến nghị < 5MB mỗi ảnh) rồi thử lại."
    );
  }

  if (status === 400) {
    return `Yêu cầu tạo ảnh chưa hợp lệ. ${serverMessage ?? ""}`.trim();
  }
  if (status === 401 || status === 403) {
    return "Không có quyền truy cập Gemini API. Vui lòng kiểm tra API key/cấu hình quyền.";
  }
  if (status === 429) {
    return "Gemini API đang bị giới hạn tốc độ (429). Vui lòng đợi một chút rồi thử lại.";
  }
  if (status >= 500) {
    return `Máy chủ tạo ảnh gặp lỗi (${status}). ${serverMessage ?? "Vui lòng thử lại sau."}`.trim();
  }
  return serverMessage ?? `Yêu cầu tạo ảnh thất bại (HTTP ${status}).`;
}

function mapGenerateErrorCode(params: {
  status: number;
  serverMessage?: string;
  serverErrorCode?: string;
}): string {
  const fromServer = params.serverErrorCode?.trim();
  if (fromServer) {
    return `E-GEN-${fromServer}`;
  }
  const lower = (params.serverMessage ?? "").toLowerCase();
  if (
    params.status === 413 ||
    lower.includes("request entity too large") ||
    lower.includes("payload too large")
  ) {
    return "E-GEN-413";
  }
  if (params.status === 400) return "E-GEN-400";
  if (params.status === 401 || params.status === 403) return "E-GEN-403";
  if (params.status === 429) return "E-GEN-429";
  if (params.status === 504) return "E-GEN-504";
  if (params.status >= 500) return "E-GEN-5XX";
  return "E-GEN-UNKNOWN";
}

async function parseGenerateResponse(res: Response): Promise<{
  json: {
    image?: unknown;
    source?: unknown;
    meta?: unknown;
    placeholderError?: unknown;
    failedStep?: unknown;
    errorCode?: unknown;
    error?: unknown;
  } | null;
  text: string | null;
}> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const json = (await res.json()) as {
        image?: unknown;
        source?: unknown;
        meta?: unknown;
        placeholderError?: unknown;
        failedStep?: unknown;
        errorCode?: unknown;
        error?: unknown;
      };
      return { json, text: null };
    } catch {
      return { json: null, text: null };
    }
  }

  try {
    const text = await res.text();
    return { json: null, text };
  } catch {
    return { json: null, text: null };
  }
}

function timeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    externalSignal.addEventListener(
      "abort",
      () => controller.abort(),
      { once: true }
    );
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
    once: true,
  });
  return controller.signal;
}

export function composeUserPrompt(input: {
  userPrompt: string;
  headline?: string;
  subheadline?: string;
  ctaText?: string;
}): string {
  const base = input.userPrompt.trim();
  const headline = input.headline?.trim() ?? "";
  const sub = input.subheadline?.trim() ?? "";
  const cta = input.ctaText?.trim() ?? "";

  const lines: string[] = [];
  if (base) lines.push(base);
  if (headline) lines.push(`Headline: ${headline}`);
  if (sub) lines.push(`Subheadline: ${sub}`);
  if (cta) lines.push(`CTA: ${cta}`);

  return lines.join("\n");
}

export async function requestFullGeneration(options?: {
  signal?: AbortSignal;
  onProgress?: (update: GenerationUpdate) => void;
}): Promise<FullGenerationResult> {
  const state = useEditorStore.getState();
  const payload = {
    canvasConfig: state.canvasConfig,
    assets: state.assets,
    brandKit: state.brandKit,
    userPrompt: composeUserPrompt({
      userPrompt: state.userPrompt,
      headline: state.headline,
      subheadline: state.subheadline,
      ctaText: state.ctaText,
    }),
    styleControls: state.styleControls,
  };

  try {
    options?.onProgress?.({ status: "running" });
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: timeoutSignal(CLIENT_TIMEOUT_MS, options?.signal),
      body: JSON.stringify(payload),
    });
    const parsed = await parseGenerateResponse(res);
    const data = parsed.json;
    if (!res.ok || typeof data?.image !== "string") {
      const serverMsg =
        typeof data?.error === "string"
          ? data.error
          : parsed.text?.trim() || undefined;
      const shortCode = mapGenerateErrorCode({
        status: res.status,
        serverMessage: serverMsg,
        serverErrorCode:
          typeof data?.errorCode === "string" ? data.errorCode : undefined,
      });
      const friendly = explainGenerateHttpError(res.status, serverMsg);
      const technical = serverMsg
        ? ` [Chi tiết phản hồi: ${serverMsg.slice(0, 200)}]`
        : "";
      const msg = `[${shortCode}] ${friendly}${technical}`;
      throw new Error(msg);
    }
    const source = data.source === "placeholder" ? "placeholder" : "gemini";
    const placeholderError =
      typeof data.placeholderError === "string" ? data.placeholderError : undefined;
    const failedStep =
      typeof data.failedStep === "string" ? data.failedStep : undefined;
    const errorCode = typeof data.errorCode === "string" ? data.errorCode : undefined;
    const meta =
      typeof data.meta === "object" && data.meta !== null
        ? (data.meta as {
            model: string;
            elapsedMs: number;
            promptTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
            costUsd?: number;
          })
        : undefined;
    options?.onProgress?.({
      status: source === "placeholder" ? "fallback" : "done",
      source,
      meta,
      placeholderError,
      failedStep,
      errorCode,
    });
    return {
      ok: true,
      image: data.image,
      source,
      meta,
      placeholderError,
      failedStep,
      errorCode,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Đã hủy tác vụ tạo banner." };
    }
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Tạo banner thất bại do lỗi không xác định.";
    options?.onProgress?.({ status: "error" });
    return {
      ok: false,
      error: message,
    };
  }
}
