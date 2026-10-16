import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@/lib/types';
import { buildGeneratePayloadFromStore } from '@/lib/client-generation';
import { compileGraph } from '@/lib/flow/compiler';
import { toLegacyConfig } from '@/lib/flow/legacy/to-legacy-config';
import { LEGACY_FIXTURES } from '@/lib/flow/__tests__/fixtures/legacy';
import { DEFAULT_TEMPLATES } from '@/lib/flow/template';
import { loadEditorStateIntoFlow } from '@/components/flow/open-from-form';
import { useEditorStore } from '../editor';
import { useFlowStore } from '../flow-store';

const normalize = (r: GenerationRequest) => ({ ...r, assets: [...r.assets].sort((a, b) => a.id.localeCompare(b.id)) });

/** T6.2: "Mở trong canvas" phải ra graph chạy đúng request form sẽ gửi (Q5A – flat, parity T2.7). */
describe('Mở trong canvas từ form (T6.2)', () => {
  for (const [name, fx] of Object.entries(LEGACY_FIXTURES)) {
    it(`${name}: graph flat → request giống hệt form`, () => {
      const r = fx.request;
      useEditorStore.setState({
        canvasConfig: r.canvasConfig, assets: r.assets, brandKit: r.brandKit, styleControls: r.styleControls,
        imageModel: r.imageModel, marketingBrief: r.marketingBrief ?? { campaignIntents: [], focalSubjects: [] },
        userPrompt: fx.form.userPrompt, headline: fx.form.headline, subheadline: fx.form.subheadline, ctaText: fx.form.ctaText,
      });
      // Đang mở template (Simple view) → graph từ form thay hẳn.
      useFlowStore.getState().loadTemplate(DEFAULT_TEMPLATES[0]!);

      loadEditorStateIntoFlow();
      const flow = useFlowStore.getState();
      expect(flow).toMatchObject({ view: 'canvas', exposed: [], templateId: null, docId: null });
      expect(flow.graph.nodes.some((n) => n.type === 'generate-flat')).toBe(true);

      const compiled = compileGraph(flow.graph);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
      const res = toLegacyConfig(compiled.job, { dataUrls: flow.assetData });
      if (!res.ok) throw new Error(res.error.message);
      expect(normalize(res.requests[0]!.request)).toEqual(normalize(buildGeneratePayloadFromStore(r.canvasConfig)));
    });
  }

  it('tên project = tiêu đề form, không có thì theo kích thước', () => {
    useEditorStore.setState({ headline: '  Sale 11.11 ' });
    loadEditorStateIntoFlow();
    expect(useFlowStore.getState().docTitle).toBe('Sale 11.11');
    useEditorStore.setState({ headline: '' });
    loadEditorStateIntoFlow();
    expect(useFlowStore.getState().docTitle).toBe(`Từ form – ${useEditorStore.getState().canvasConfig.name}`);
  });
});
