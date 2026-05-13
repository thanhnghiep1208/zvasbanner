/** User-facing messages for client-side export failures (canvas / proxy). */
export function explainExportError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes("proxy fetch failed: 413")) {
    return "[E-EXP-413] Ảnh quá lớn nên không thể xuất. Vui lòng dùng ảnh nhẹ hơn hoặc giảm độ phân giải export.";
  }
  if (msg.includes("proxy fetch failed")) {
    return "[E-EXP-PROXY] Không thể tải ảnh gốc để xuất (lỗi proxy/CORS). Vui lòng thử lại hoặc đổi ảnh.";
  }
  if (msg.includes("image failed to load")) {
    return "[E-EXP-LOAD] Không thể đọc ảnh để xuất. Vui lòng tạo lại banner hoặc thử ảnh khác.";
  }
  if (msg.includes("could not get canvas context")) {
    return "[E-EXP-CANVAS] Trình duyệt không hỗ trợ canvas export ở phiên hiện tại. Vui lòng tải lại trang rồi thử lại.";
  }
  if (msg.includes("empty image")) {
    return "[E-EXP-EMPTY] Ảnh xuất ra bị rỗng. Vui lòng thử xuất lại.";
  }
  return `[E-EXP-UNKNOWN] Xuất thất bại: ${message}`;
}
