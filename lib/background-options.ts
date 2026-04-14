import type {
  BackgroundEffectOption,
  BackgroundGrainOption,
  BackgroundShapeOption,
  BackgroundToneOption,
} from "@/lib/types";

export const BACKGROUND_TONE_OPTIONS: Array<{
  value: BackgroundToneOption;
  label: string;
  description: string;
}> = [
  {
    value: "warm-sunset",
    label: "Warm Sunset",
    description: "Cam dao, hong phan, vang nang (cam giac am ap).",
  },
  {
    value: "ocean-breeze",
    label: "Ocean Breeze",
    description: "Xanh duong, teal, xanh la ma (cam giac tuoi mat).",
  },
  {
    value: "deep-twilight",
    label: "Deep Twilight",
    description: "Tim tham, xanh indigo, cam chay (cam giac huyen bi).",
  },
  {
    value: "pastel-dream",
    label: "Pastel Dream",
    description: "Mau keo ngot, do bao hoa thap (cam giac nhe nhang).",
  },
  {
    value: "nordic-forest",
    label: "Nordic Forest",
    description:
      "Xanh reu, xanh thong tram, xam suong mu (cam giac tinh lang, binh yen).",
  },
  {
    value: "desert-sand",
    label: "Desert Sand",
    description:
      "Mau dat nung (terracotta), vang cat, nau sienna (cam giac moc mac, am kho).",
  },
  {
    value: "volcanic-ash",
    label: "Volcanic Ash",
    description:
      "Xam than, do tham, cam chay (cam giac manh me, nguyen ban).",
  },
  {
    value: "spring-blossom",
    label: "Spring Blossom",
    description:
      "Xanh la mam, hong hoa anh dao, trang kem (cam giac tuoi moi, tran day suc song).",
  },
  {
    value: "cyberpunk-neon",
    label: "Cyberpunk Neon",
    description:
      "Hong neon, xanh dien tu (electric blue), tim dam (cam giac tuong lai, nang dong).",
  },
  {
    value: "midnight-luxury",
    label: "Midnight Luxury",
    description:
      "Den obsidian, xam than chi, diem xuyet vang gold (cam giac sang trong, cao cap).",
  },
  {
    value: "industrial-grey",
    label: "Industrial Grey",
    description:
      "Xam be tong, xanh thep, trang bac (cam giac toi gian, cung cap).",
  },
  {
    value: "synthwave-night",
    label: "Synthwave Night",
    description:
      "Tim magenta, xanh cyan, den sau (cam giac hoai co thap nien 80).",
  },
  {
    value: "lavender-haze",
    label: "Lavender Haze",
    description:
      "Tim oai huong nhat, xam khoi, xanh lo (cam giac mo mang, lang dang).",
  },
  {
    value: "vintage-film",
    label: "Vintage Film",
    description:
      "Xanh teal dam, cam dat, vang mustard (cam giac dien anh co dien).",
  },
  {
    value: "monochrome-mist",
    label: "Monochrome Mist",
    description:
      "Cac sac do tu trang den den (cam giac chieu sau, tap trung vao texture).",
  },
  {
    value: "ethereal-glow",
    label: "Ethereal Glow",
    description:
      "Trang ngoc trai, xanh opal, hong anh kim (cam giac nhe tenh, sieu thuc).",
  },
];

export const BACKGROUND_GRAIN_OPTIONS: Array<{
  value: BackgroundGrainOption;
  label: string;
  description: string;
}> = [
  {
    value: "subtle-grain",
    label: "Subtle Grain",
    description: "Hat min, hien dai, chi du de tao chieu sau.",
  },
  {
    value: "classic-film",
    label: "Classic Film",
    description: "Do hat vua phai, giong anh chup phim 35mm.",
  },
  {
    value: "heavy-retro",
    label: "Heavy Retro",
    description: "Hat tho, ro net, phong cach poster thap nien 70-80.",
  },
];

export const BACKGROUND_SHAPE_OPTIONS: Array<{
  value: BackgroundShapeOption;
  label: string;
  description: string;
}> = [
  {
    value: "blurry-organic",
    label: "Blurry Organic",
    description: "Cac mang mau loang khong dinh hinh, cuc mem.",
  },
  {
    value: "abstract-blobs",
    label: "Abstract Blobs",
    description: "Cac khoi tron hoac uon luon co phan tach ro hon.",
  },
  {
    value: "liquid-flow",
    label: "Liquid Flow",
    description: "Cac duong ke uon luon nhu dong nuoc.",
  },
  {
    value: "central-glow",
    label: "Central Glow",
    description: "Mau sac tap trung o giua va toi dan ra cac canh.",
  },
];

export const BACKGROUND_EFFECT_OPTIONS: Array<{
  value: BackgroundEffectOption;
  label: string;
  description: string;
}> = [
  {
    value: "minimalist",
    label: "Minimalist",
    description: "Don gian, sach se, it chi tiet thua.",
  },
  {
    value: "dreamy-ethereal",
    label: "Dreamy/Ethereal",
    description: "Hieu ung hao quang (Glow), mo ao nhu trong mo.",
  },
  {
    value: "lofi-vintage",
    label: "Lo-fi Vintage",
    description: "Cam giac cu ky, hoi nhoe o cac canh (Vignetting).",
  },
  {
    value: "high-contrast",
    label: "High-Contrast",
    description: "Chuyen mau gat, tao an tuong manh.",
  },
];
