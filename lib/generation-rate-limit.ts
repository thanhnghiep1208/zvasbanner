import { createRateLimiter } from "@/lib/request-limits";

/**
 * Giới hạn sinh ảnh dùng chung (20 lần / giờ / user) cho mọi route gọi model ảnh (hiện là /api/generate, dùng chung
 * cho form và Flow canvas). Một bộ đếm duy nhất để route mới không tạo đường vòng qua giới hạn (SPEC 2.7).
 * In-memory theo instance – giống trước đây; muốn chặn xuyên instance cần Redis/KV.
 */
export const checkGenerationRateLimit = createRateLimiter(20, 60 * 60 * 1000);
