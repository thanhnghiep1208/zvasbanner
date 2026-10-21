/** Thông tin liên hệ cấp tài khoản, hiện ở màn hình chưa đăng nhập. Chuỗi rỗng = ẩn mục đó. */
export type ContactInfo = {
  email: string;
  phone: string;
};

export const EMPTY_CONTACT_INFO: ContactInfo = { email: "", phone: "" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 .()-]+$/;

/** Giá trị mặc định khi DB chưa có bản ghi (hoặc không có DATABASE_URL). */
export function contactInfoFromEnv(env: Record<string, string | undefined>): ContactInfo {
  return {
    email: env.CONTACT_EMAIL?.trim() ?? "",
    phone: env.CONTACT_PHONE?.trim() ?? "",
  };
}

export type ContactInfoValidation =
  | { ok: true; value: ContactInfo }
  | { ok: false; error: string };

export function validateContactInfo(input: unknown): ContactInfoValidation {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Dữ liệu không hợp lệ." };
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.email !== "string" || typeof raw.phone !== "string") {
    return { ok: false, error: "Thiếu email hoặc số điện thoại." };
  }
  const email = raw.email.trim();
  const phone = raw.phone.trim();

  if (email && (email.length > 254 || !EMAIL_RE.test(email))) {
    return { ok: false, error: "Email không hợp lệ." };
  }
  const digits = phone.replace(/\D/g, "");
  if (phone && (phone.length > 24 || !PHONE_RE.test(phone) || digits.length < 8 || digits.length > 15)) {
    return { ok: false, error: "Số điện thoại không hợp lệ." };
  }
  return { ok: true, value: { email, phone } };
}

/** `0901 234 567` → `tel:0901234567`; giữ dấu + đầu số quốc tế. */
export function phoneTelHref(phone: string): string {
  const plus = phone.trim().startsWith("+") ? "+" : "";
  return `tel:${plus}${phone.replace(/\D/g, "")}`;
}
