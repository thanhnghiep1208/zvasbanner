import { describe, expect, it } from 'vitest';
import { migrateFlowDoc, serializeFlowDoc } from '../persistence';
import { decompileJob } from '../decompiler';
import { composedMinimal } from './fixtures';

describe('persistence', () => {
  it('serialize → JSON → migrate giữ nguyên graph', () => {
    const doc = serializeFlowDoc(decompileJob(composedMinimal), { x: 0, y: 0, zoom: 1 });
    expect(migrateFlowDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
  it('doc từ version tương lai bị từ chối', () => {
    expect(() => migrateFlowDoc({ schemaVersion: 99, graph: { nodes: [], edges: [] } })).toThrow();
  });
  it('dữ liệu rác bị từ chối', () => {
    expect(() => migrateFlowDoc({ foo: 1 })).toThrow();
  });
});
