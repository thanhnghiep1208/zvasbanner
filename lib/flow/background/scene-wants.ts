/**
 * Bục và hoa lá chỉ khi brief nhắc tới (Nghiệp 2026-10-19: nền nào cũng có bục nâng sản phẩm + hoa lá dù prompt
 * không yêu cầu). Nguyên nhân là prompt nền tự gợi ý ("If you show a pedestal…", "decorative elements (plants, …)").
 * Đọc mô tả bối cảnh nền (tiếng Việt có dấu hoặc tiếng Anh) để quyết định có cho phép hay cấm hẳn.
 */

// Ranh giới chữ theo Unicode: "hoa" không khớp "hoà"/"hoá", "lá" không khớp "lạ".
const word = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'iu');

const PEDESTAL = word('bục|bệ|kệ|đế trưng bày|đế|trụ trưng bày|podium|podiums|pedestal|pedestals|plinth|plinths|display stand|riser|cylinder stand');
const FOLIAGE = word('lá|hoa|cây|cành|cọ|dương xỉ|thực vật|nhiệt đới|mai|đào|sen|hồng|plant|plants|leaf|leaves|foliage|flower|flowers|floral|botanical|palm|palms|tropical|fern|ferns|petal|petals|greenery|bouquet');

export interface SceneWants {
  pedestal: boolean;
  foliage: boolean;
}

export function sceneWants(text: string): SceneWants {
  return { pedestal: PEDESTAL.test(text), foliage: FOLIAGE.test(text) };
}
