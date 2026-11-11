import { describe, expect, it } from 'vitest';
import { parseLevel, serializeLevel, LevelFormatError, DEFECT_TYPES } from './level';
import tutorialRaw from '../levels/tutorial-viaduct.json';

/** 最小合法关卡样例。 */
const minimal = {
  id: 'demo',
  caseName: '测试案件',
  subtitle: '测试副标题',
  brief: '测试简介',
  timeLimitSec: 60,
  spawn: { position: [0, 9, 0], yawDeg: -90 },
  hotspots: [
    {
      id: 'h1',
      label: '测试热点',
      position: [1, 2, 3],
      component: 'deck',
      answer: { type: 'crack', severity: 'medium' },
      description: '描述',
      normNote: '依据',
    },
  ],
};

describe('parseLevel 关卡校验', () => {
  it('最小合法关卡通过并保留字段', () => {
    const level = parseLevel(minimal);
    expect(level.id).toBe('demo');
    expect(level.hotspots[0]?.position).toEqual([1, 2, 3]);
    expect(level.hotspots[0]?.component).toBe('deck');
  });

  it('热点 id 重复 → 报错', () => {
    const dup = { ...minimal, hotspots: [...minimal.hotspots, { ...minimal.hotspots[0] }] };
    expect(() => parseLevel(dup)).toThrow(LevelFormatError);
  });

  it('未知缺陷类型 → 报错', () => {
    const bad = {
      ...minimal,
      hotspots: [{ ...minimal.hotspots[0], answer: { type: 'ufo', severity: 'light' } }],
    };
    expect(() => parseLevel(bad)).toThrow(/answer\.type/);
  });

  it('未知严重度 → 报错', () => {
    const bad = {
      ...minimal,
      hotspots: [{ ...minimal.hotspots[0], answer: { type: 'crack', severity: 'huge' } }],
    };
    expect(() => parseLevel(bad)).toThrow(/answer\.severity/);
  });

  it('无缺陷热点 severity 必须为 none', () => {
    const bad = {
      ...minimal,
      hotspots: [{ ...minimal.hotspots[0], answer: { type: 'none', severity: 'light' } }],
    };
    expect(() => parseLevel(bad)).toThrow(/none/);
  });

  it('坐标不是三元数字 → 报错', () => {
    const bad = {
      ...minimal,
      hotspots: [{ ...minimal.hotspots[0], position: [1, 2] }],
    };
    expect(() => parseLevel(bad)).toThrow(/position/);
  });

  it('缺 component 部位字段 → 报错(M1 起必填)', () => {
    const bad = {
      ...minimal,
      hotspots: [{ ...minimal.hotspots[0], component: 'roof' }],
    };
    expect(() => parseLevel(bad)).toThrow(/component/);
  });

  it('defectTypes 答案类型不在范围内 → 报错(玩家将无法判对)', () => {
    const bad = { ...minimal, defectTypes: ['spalling', 'corrosion'] };
    expect(() => parseLevel(bad)).toThrow(/不在 defectTypes 范围内/);
  });

  it('defectTypes 允许覆盖 M2 新类型(圬工 / 钢构,数据结构就位)', () => {
    const level = parseLevel({
      ...minimal,
      defectTypes: ['masonryWeathering', 'mortarLoss', 'rivetMissing', 'memberFracture'],
      hotspots: [
        { ...minimal.hotspots[0], answer: { type: 'rivetMissing', severity: 'severe' }, component: 'superstructure' },
      ],
    });
    expect(level.defectTypes).toHaveLength(4);
  });
});

describe('serializeLevel 序列化(关卡编辑器保存格式)', () => {
  it('教学关 round-trip:parse(serialize(parse(json))) 与原数据深度相等', () => {
    const once = parseLevel(tutorialRaw);
    const twice = parseLevel(JSON.parse(JSON.stringify(serializeLevel(once))));
    expect(twice).toEqual(once);
  });

  it('interactRadius 可选字段保留,缺省字段不输出', () => {
    const once = parseLevel(minimal);
    const raw = serializeLevel(once) as { hotspots: { interactRadius?: number }[] };
    expect(raw.hotspots[0]?.interactRadius).toBeUndefined();
    const withRadius = parseLevel({
      ...minimal,
      hotspots: [{ ...minimal.hotspots[0], interactRadius: 6 }],
    });
    const raw2 = serializeLevel(withRadius) as { hotspots: { interactRadius?: number }[] };
    expect(raw2.hotspots[0]?.interactRadius).toBe(6);
  });

  it('16 类缺陷全部可被解析器接受(三案件数据结构就位)', () => {
    expect(DEFECT_TYPES.length).toBe(16);
    for (const t of DEFECT_TYPES) {
      const level = parseLevel({
        ...minimal,
        hotspots: [{ ...minimal.hotspots[0], answer: { type: t, severity: 'light' } }],
      });
      expect(level.hotspots[0]?.answer.type).toBe(t);
    }
  });

  it('epilogue 尾声与 asset.glb 字段:可解析、可序列化 round-trip', () => {
    const level = parseLevel({
      ...minimal,
      epilogue: '尾声文案:此桥必复。',
      asset: { glb: '/assets/levels/demo.glb' },
    });
    expect(level.epilogue).toBe('尾声文案:此桥必复。');
    expect(level.asset?.glb).toBe('/assets/levels/demo.glb');
    const again = parseLevel(JSON.parse(JSON.stringify(serializeLevel(level))));
    expect(again.epilogue).toBe(level.epilogue);
    expect(again.asset).toEqual(level.asset);
  });

  it('epilogue 为空串 / asset.glb 缺失 → 报错', () => {
    expect(() => parseLevel({ ...minimal, epilogue: '' })).toThrow(/epilogue/);
    expect(() => parseLevel({ ...minimal, asset: {} })).toThrow(/asset\.glb/);
  });
});

describe('教学关 tutorial-viaduct.json 数据契约(M1 布点)', () => {
  const level = parseLevel(tutorialRaw);

  it('可解析,且热点 ≥ 8(M1 交付标准:实际 10)', () => {
    expect(level.hotspots.length).toBeGreaterThanOrEqual(8);
    expect(level.hotspots.length).toBe(10);
  });

  it('含 ≥ 1 个完好诱饵(答案为无缺陷)', () => {
    const decoys = level.hotspots.filter((h) => h.answer.type === 'none');
    expect(decoys.length).toBeGreaterThanOrEqual(1);
  });

  it('缺陷类型 ≥ 4 种(BRIEF 教学关要求)', () => {
    const types = new Set(level.hotspots.filter((h) => h.answer.type !== 'none').map((h) => h.answer.type));
    expect(types.size).toBeGreaterThanOrEqual(4);
  });

  it('裂缝三形态齐备:网状 / 纵向 / 横向', () => {
    const cracks = level.hotspots.filter((h) => h.answer.type === 'crack');
    expect(cracks.length).toBe(3); // 网裂(轻)+ 纵裂(重)+ 横裂(中)
  });

  it('三个结构部件都有热点(三部件 BCI 可演示)', () => {
    for (const c of ['deck', 'superstructure', 'substructure'] as const) {
      expect(level.hotspots.some((h) => h.component === c), c).toBe(true);
    }
  });

  it('defectTypes 范围覆盖全部非诱饵答案,且收敛在 7 类教学口径', () => {
    expect(level.defectTypes).toBeDefined();
    expect(level.defectTypes?.length).toBe(7);
    const inScope = new Set(level.defectTypes ?? []);
    for (const h of level.hotspots) {
      if (h.answer.type !== 'none') expect(inScope.has(h.answer.type), h.id).toBe(true);
    }
  });

  it('所有热点坐标在桥长范围内且有规范文案、部位合法', () => {
    for (const h of level.hotspots) {
      expect(Math.abs(h.position[0]), `${h.id} x`).toBeLessThanOrEqual(45.5);
      expect(h.normNote.length).toBeGreaterThan(4);
      expect(h.description.length).toBeGreaterThan(6);
      expect(['deck', 'superstructure', 'substructure']).toContain(h.component);
    }
  });

  it('出生点在桥面上(y=9)朝向桥尾,时限 > 0', () => {
    expect(level.spawn.position[1]).toBe(9);
    expect(level.timeLimitSec).toBeGreaterThan(0);
  });
});
