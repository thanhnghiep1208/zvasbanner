export function explainEnhanceHttpError(status: number, message?: string): string {
  if (status === 400) {
    return `Dữ liệu cải thiện prompt chưa hợp lệ. ${message ?? ""}`.trim();
  }
  if (status === 401) {
    return (
      message?.trim() ||
      "Cần đăng nhập để cải thiện prompt. Vui lòng đăng nhập và thử lại."
    );
  }
  if (status === 429) {
    return "Gemini API đang quá tải/rate limit khi cải thiện prompt. Vui lòng thử lại sau ít phút.";
  }
  if (status === 504) {
    return "Yêu cầu cải thiện prompt bị timeout. Vui lòng thử lại.";
  }
  if (status >= 500) {
    return `Máy chủ cải thiện prompt gặp lỗi (${status}). ${message ?? "Vui lòng thử lại sau."}`.trim();
  }
  return message ?? `Cải thiện prompt thất bại (HTTP ${status}).`;
}

export function mapEnhanceErrorCode(status: number): string {
  if (status === 400) return "E-ENH-400";
  if (status === 401) return "E-ENH-401";
  if (status === 429) return "E-ENH-429";
  if (status === 504) return "E-ENH-504";
  if (status >= 500) return "E-ENH-5XX";
  return "E-ENH-UNKNOWN";
}
