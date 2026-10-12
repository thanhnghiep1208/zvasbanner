# Bước 1 – Schema + compiler

## Đã có
- `schema.ts` – port types, params từng node, Transform/ShadowConfig, schemaVersion
- `node-definitions.ts` – registry 13 node: ports, default params, aiCallsPerRatio
- `connection-rules.ts` – `canConnect()` cho `isValidConnection` của React Flow + message lỗi
- `validate.ts` – validate toàn graph (required input, capacity, cycle, export, text AI, alpha)
- `compiled-job.ts` – IR trung gian + `estimateAiCalls()`
- `compiler.ts` – graph → CompiledJob (composed + flat legacy)
- `decompiler.ts` – CompiledJob → graph (migrate + template)
- `persistence.ts` – StoredFlowDoc (JSONB) + khung migration theo version
- 21 test pass (vitest), tsc strict pass

## Invariant được test tự động
- Không executor non-legacy nào có port `product` → pixel sản phẩm không thể đi vào Gemini trong composed
- Chỉ executor mới được tốn AI call

## Việc còn lại để đóng bước 1
- [ ] Copy `lib/flow/` vào repo, chạy test bằng runner của repo
- [ ] Viết `to-legacy-config.ts`: CompiledJob → canvasConfig (cần type canvasConfig thật)
- [ ] Viết `from-legacy-config.ts`: canvasConfig → CompiledJob (cho migration)
- [ ] Thay 3 fixture giả bằng 3 config thật từ Postgres, round-trip pass
- [ ] Trong `store/flow-store.ts`: dùng `canConnect` cho `onConnect` / `isValidConnection`

## Chưa thuộc bước 1
- Layout engine (tính transform từ product + text + ratio) – làm cùng bước 4
- Adapter FlowNode ↔ React Flow node – bước 2
