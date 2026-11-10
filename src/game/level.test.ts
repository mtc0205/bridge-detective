import { describe, expect, it } from 'vitest';
import { parseLevel, LevelFormatError } from './level';
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
});

describe('教学关 tutorial-viaduct.json 数据契约', () => {
  const level = parseLevel(tutorialRaw);

  it('可解析,且热点 ≥ 8(M0 交付标准)', () => {
    expect(level.hotspots.length).toBeGreaterThanOrEqual(8);
  });

  it('含 ≥ 1 个完好诱饵(答案为无缺陷)', () => {
    const decoys = level.hotspots.filter((h) => h.answer.type === 'none');
    expect(decoys.length).toBeGreaterThanOrEqual(1);
  });

  it('缺陷类型 ≥ 4 种(BRIEF 教学关要求)', () => {
    const types = new Set(level.hotspots.filter((h) => h.answer.type !== 'none').map((h) => h.answer.type));
    expect(types.size).toBeGreaterThanOrEqual(4);
  });

  it('所有热点坐标在桥长范围内且有规范文案', () => {
    for (const h of level.hotspots) {
      expect(Math.abs(h.position[0]), `${h.id} x`).toBeLessThanOrEqual(45.5);
      expect(h.normNote.length).toBeGreaterThan(4);
      expect(h.description.length).toBeGreaterThan(6);
    }
  });

  it('出生点在桥面上(y=9)朝向桥尾', () => {
    expect(level.spawn.position[1]).toBe(9);
    expect(level.timeLimitSec).toBeGreaterThan(0);
  });
});
