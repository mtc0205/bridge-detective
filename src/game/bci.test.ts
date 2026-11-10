import { describe, expect, it } from 'vitest';
import { bciToGrade, computeBci, GRADE_LABELS, type BciFinding } from './bci';

describe('computeBci 简化 BCI', () => {
  it('无发现 → BCI 100,一类', () => {
    expect(computeBci([])).toBe(100);
    expect(bciToGrade(100)).toBe(1);
  });

  it('单个轻微裂缝只扣少量分', () => {
    const bci = computeBci([{ type: 'crack', severity: 'light' }]); // 3 × 0.5 = 1.5
    expect(bci).toBe(98.5);
    expect(bciToGrade(bci)).toBe(1);
  });

  it('支座脱空(重)权重最高', () => {
    const bci = computeBci([{ type: 'bearingVoid', severity: 'severe' }]); // 10 × 1.5 = 15
    expect(bci).toBe(85);
  });

  it('教学关全缺陷清单(8 处)→ 三类(合格)', () => {
    const findings: BciFinding[] = [
      { type: 'expansionJoint', severity: 'medium' },
      { type: 'crack', severity: 'light' },
      { type: 'drainageBlock', severity: 'medium' },
      { type: 'railingDamage', severity: 'light' },
      { type: 'crack', severity: 'severe' },
      { type: 'other', severity: 'light' },
      { type: 'spalling', severity: 'medium' },
      { type: 'bearingVoid', severity: 'severe' },
    ];
    const bci = computeBci(findings);
    expect(bci).toBe(67);
    expect(bciToGrade(bci)).toBe(3);
  });

  it('极端堆叠缺陷 → 夹取为 0,五类(危桥)', () => {
    const many: BciFinding[] = Array.from({ length: 30 }, () => ({
      type: 'bearingVoid' as const,
      severity: 'severe' as const,
    }));
    expect(computeBci(many)).toBe(0);
    expect(bciToGrade(0)).toBe(5);
  });
});

describe('bciToGrade 分级区间(JTG/T H21-2011 简化)', () => {
  it.each([
    [100, 1],
    [95, 1],
    [94.9, 2],
    [80, 2],
    [79.9, 3],
    [66, 3],
    [65.9, 4],
    [50, 4],
    [49.9, 5],
    [0, 5],
  ])('BCI %p → %p 类', (bci, grade) => {
    expect(bciToGrade(bci)).toBe(grade);
  });

  it('五个等级都有中文标签', () => {
    for (const g of [1, 2, 3, 4, 5] as const) {
      expect(GRADE_LABELS[g].length).toBeGreaterThan(2);
    }
  });
});
