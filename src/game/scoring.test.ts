import { describe, expect, it } from 'vitest';
import { judge, SCORE_RULES } from './scoring';
import type { HotspotAnswer } from './level';

const truth = (type: HotspotAnswer['type'], severity: HotspotAnswer['severity']): HotspotAnswer => ({
  type,
  severity,
});

describe('judge 判定计分(BRIEF 简化版)', () => {
  it('类型与严重度全对 → +100,计入 BCI', () => {
    const j = judge({ kind: 'defect', type: 'crack', severity: 'severe' }, truth('crack', 'severe'));
    expect(j.kind).toBe('correct');
    expect(j.scoreDelta).toBe(SCORE_RULES.fullMatch);
    expect(j.counted).toBe(true);
  });

  it('类型对、严重度偏 → +40,计入 BCI', () => {
    const j = judge({ kind: 'defect', type: 'crack', severity: 'light' }, truth('crack', 'medium'));
    expect(j.kind).toBe('severityMiss');
    expect(j.scoreDelta).toBe(SCORE_RULES.severityPartial);
    expect(j.counted).toBe(true);
  });

  it('真缺陷类型判错 → 0 分,不计入 BCI', () => {
    const j = judge({ kind: 'defect', type: 'drainageBlock', severity: 'medium' }, truth('crack', 'medium'));
    expect(j.kind).toBe('typeMiss');
    expect(j.scoreDelta).toBe(SCORE_RULES.wrongType);
    expect(j.counted).toBe(false);
    expect(j.detail).toContain('裂缝');
  });

  it('真缺陷被判「无缺陷」→ 漏检,0 分', () => {
    const j = judge({ kind: 'noDefect' }, truth('bearingVoid', 'severe'));
    expect(j.kind).toBe('missedDefect');
    expect(j.scoreDelta).toBe(0);
    expect(j.counted).toBe(false);
  });

  it('完好诱饵被标缺陷 → 误报扣分(BRIEF:鼓励不确定就不标)', () => {
    const j = judge({ kind: 'defect', type: 'crack', severity: 'medium' }, truth('none', 'none'));
    expect(j.kind).toBe('falsePositive');
    expect(j.scoreDelta).toBe(SCORE_RULES.decoyFalsePositive);
    expect(j.scoreDelta).toBeLessThan(0);
    expect(j.counted).toBe(false);
  });

  it('完好诱饵正确排除 → +100', () => {
    const j = judge({ kind: 'noDefect' }, truth('none', 'none'));
    expect(j.kind).toBe('decoyPass');
    expect(j.scoreDelta).toBe(SCORE_RULES.decoyCorrectPass);
  });

  it('七类缺陷类型各自可正确判定', () => {
    const types = ['crack', 'spalling', 'bearingVoid', 'expansionJoint', 'railingDamage', 'drainageBlock', 'other'] as const;
    for (const t of types) {
      const j = judge({ kind: 'defect', type: t, severity: 'light' }, truth(t, 'light'));
      expect(j.kind, `类型 ${t}`).toBe('correct');
    }
  });
});
