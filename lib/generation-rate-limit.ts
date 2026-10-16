import { createRateLimiter } from "@/lib/request-limits";

/**
 * Giới hạn sinh ảnh dùng chung (20 lần / giờ / user) cho mọi route gọi model ảnh:
 * /api/generate (form) và /api/flow/generate-background (Flow canvas, SPEC Q8).
 * Một bộ đếm duy nhất để Flow canvas không tạo đường vòng qua giới hạn (SPEC 2.7).
 * In-memory theo instance – giống trước đây; muốn chặn xuyên instance cần Redis/KV.
 */
export const checkGenerationRateLimit = createRateLimiter(20, 60 * 60 * 1000);
