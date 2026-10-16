import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@/lib/types';
import { composeUserPrompt } from '@/lib/client-generation';
import { parseGenerationRequest } from '@/lib/validate-generation';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { toLegacyConfig } from '../legacy/to-legacy-config';
import { decompileJob } from '../decompiler';
import { compileGraph } from '../compiler';
import { LEGACY_FIXTURES } from './fixtures/legacy';

/** toLegacyConfig xếp products trước references; server tách theo role nên so sánh theo id. */
const normalize = (r: GenerationRequest) => ({
  ...r, assets: [...r.assets].sort((a, b) => a.id.localeCompare(b.id)),
});

describe('fixture legacy (T1.4)', () => {
  it('có ≥3 payload log thật', () => {
    expect(Object.values(LEGACY_FIXTURES).filter((f) => f.source === 'logged').length).toBeGreaterThanOrEqual(3);
  });

  for (const [name, fx] of Object.entries(LEGACY_FIXTURES)) {
    describe(name, () => {
      it('server parse được request', () => {
        expect(parseGenerationRequest(fx.request)).not.toBeNull();
      });

      it('form text ghép lại đúng userPrompt', () => {
        expect(composeUserPrompt(fx.form)).toBe(fx.request.userPrompt);
      });

      it('tách text từ prompt = lấy từ form', () => {
        expect(fromLegacyConfig(fx.request).job).toEqual(fromLegacyConfig(fx.request, { form: fx.form }).job);
      });

      it('round-trip legacy → job → graph → job → legacy khớp', () => {
        const { job, runtime } = fromLegacyConfig(fx.request);
        const compiled = compileGraph(decompileJob(job));
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
        expect(compiled.job).toEqual(job);

        const res = toLegacyConfig(compiled.job, runtime);
        if (!res.ok) throw new Error(res.error.message);
        expect(res.warnings).toEqual([]);
        expect(res.requests).toHaveLength(1);
        expect(normalize(res.requests[0]!.request)).toEqual(normalize(fx.request));
      });
    });
  }
});
