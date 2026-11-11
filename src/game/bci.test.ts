import { describe, expect, it } from 'vitest';
import { bciToGrade, computeBci, CRITICAL_BCI_CAP, GRADE_LABELS, type BciFinding } from './bci';

/** 教学关全部实际缺陷(三部件)。 */
const tutorialTruth: BciFinding[] = [
  { type: 'expansionJoint', severity: 'medium', component: 'deck' }, // 9
  { type: 'crack', severity: 'light', component: 'deck' }, // 4.5
  { type: 'drainageBlock', severity: 'medium', component: 'deck' }, // 6
  { type: 'railingDamage', severity: 'light', component: 'deck' }, // 3
  { type: 'other', severity: 'light', component: 'deck' }, // 3  → 桥面系扣 25.5 → 74.5
  { type: 'crack', severity: 'severe', component: 'superstructure' }, // 13.5
  { type: 'crack', severity: 'medium', component: 'superstructure' }, // 9 → 上部扣 22.5 → 77.5
  { type: 'spalling', severity: 'medium', component: 'substructure' }, // 15
  { type: 'bearingVoid', severity: 'severe', component: 'substructure' }, // 45 → 下部扣 60 → 40
];

describe('computeBci 三部件加权(M1)', () => {
  it('无发现 → 各部件 BCI 100,一类', () => {
    const r = computeBci([]);
    expect(r.overall).toBe(100);
    expect(r.deck).toBe(100);
    expect(r.superstructure).toBe(100);
    expect(r.substructure).toBe(100);
    expect(bciToGrade(r.overall)).toBe(1);
  });

  it('单部件病害不拖累其他部件', () => {
    const r = computeBci([{ type: 'crack', severity: 'light', component: 'deck' }]); // 扣 4.5
    expect(r.deck).toBe(95.5);
    expect(r.superstructure).toBe(100);
    expect(r.substructure).toBe(100);
    expect(r.overall).toBe(99.1); // 95.5×0.2 + 100×0.8
  });

  it('教学关全部缺陷 → 加权 61.9,受主要部件拖累(40+15)与支座脱空条款压到 55 → 四类', () => {
    const r = computeBci(tutorialTruth);
    expect(r.deck).toBe(74.5);
    expect(r.superstructure).toBe(77.5);
    expect(r.substructure).toBe(40);
    // 未封顶原值 = 74.5×0.2 + 77.5×0.4 + 40×0.4 = 61.9;
    // 主要部件拖累 floor = min(77.5, 40) + 15 = 55 → 整体 55(四类)
    expect(r.criticalTrigger).toBe('bearingVoid');
    expect(r.overall).toBe(55);
    expect(bciToGrade(r.overall)).toBe(4);
    // 反证:条款只降不升,更重的缺陷组合分值更低
    const worse = computeBci([...tutorialTruth, { type: 'memberFracture', severity: 'severe', component: 'superstructure' }]);
    expect(worse.overall).toBeLessThan(r.overall);
  });

  it('漏检支座脱空 → 无关键隐患触发,BCI 明显偏乐观(玩法教学点)', () => {
    const missed = tutorialTruth.filter((f) => f.type !== 'bearingVoid');
    const r = computeBci(missed);
    expect(r.criticalTrigger).toBeNull();
    expect(r.substructure).toBe(85); // 只扣 15
    // 未封顶:74.5×0.2 + 77.5×0.4 + 85×0.4 = 79.9 → 二类,比实况(四类)乐观两档
    expect(r.overall).toBe(79.9);
  });

  it('构件断裂(重)同样触发关键隐患条款(M2 钢桥案件)', () => {
    const r = computeBci([{ type: 'memberFracture', severity: 'severe', component: 'superstructure' }]);
    expect(r.criticalTrigger).toBe('memberFracture');
    expect(r.overall).toBe(CRITICAL_BCI_CAP);
  });

  it('拱圈砌石松动(重)触发关键隐患条款(M2 石拱桥案件)', () => {
    const r = computeBci([{ type: 'stoneLoose', severity: 'severe', component: 'superstructure' }]);
    expect(r.criticalTrigger).toBe('stoneLoose');
    expect(r.overall).toBeLessThanOrEqual(CRITICAL_BCI_CAP);
  });

  it('极端堆叠缺陷 → 主要部件坍塌拖累整桥到 15,五类(危桥)', () => {
    const many: BciFinding[] = Array.from({ length: 30 }, () => ({
      type: 'bearingVoid' as const,
      severity: 'severe' as const,
      component: 'substructure' as const,
    }));
    const r = computeBci(many);
    expect(r.substructure).toBe(0);
    expect(r.overall).toBe(15); // min(加权 60, 拖累 0+15, 条款 57)
    expect(bciToGrade(r.overall)).toBe(5);
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
