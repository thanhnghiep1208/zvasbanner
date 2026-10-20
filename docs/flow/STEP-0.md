# Bước 0 – Checklist

> Tài liệu lịch sử. Chế độ composed (Ghép layer) đã gỡ 2026-10-20 – xem SPEC mục 3.

## A. Quyết định composed mode (đã chốt)
- [x] 1. Gemini biết vị trí sản phẩm khi sinh background → Auto Layout chạy TRƯỚC Generate BG, truyền layout guide (vùng trống) vào prompt
- [x] 2. Tự động tối ưu layout theo từng ratio, không được làm mất content → Auto Layout node rule-based, transform lưu theo ratio, user override lưu riêng
- [x] 3. Shadow tự động mặc định, có tuỳ chỉnh → ShadowConfig.mode = 'auto' | 'custom' | 'off'
- [x] 4. Mặc định composed → mọi template đi qua Compose; flat chỉ còn cho project migrate và path nâng cao

## B. Setup kỹ thuật
- [ ] `npm i @xyflow/react@12`
- [ ] Copy file vào repo theo đúng path
- [ ] Thêm env (local + Vercel Preview + Production):
      FLOW_CANVAS=allowlist
      FLOW_CANVAS_ALLOWLIST=<clerk_user_id_của_team>
- [ ] Production để FLOW_CANVAS=off
- [ ] Nếu middleware Clerk đang whitelist route, thêm /flow vào danh sách protected

## C. Tiêu chí hoàn thành
- [ ] User trong allowlist vào /flow → thấy canvas trống, pan/zoom được, có minimap
- [ ] User ngoài allowlist hoặc FLOW_CANVAS=off → 404
- [ ] Chưa đăng nhập → redirect /sign-in
- [ ] Không file nào trong pipeline cũ (route handlers, prompt-builder, export) bị sửa
