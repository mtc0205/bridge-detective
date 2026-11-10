/**
 * 桥梁技术状况评定 BCI(简化版,纯逻辑,可单元测试)。
 *
 * TODO(规范条目): JTG/T H21-2011 的真实 BCI 按「桥面系 / 上部结构 / 下部结构」
 * 三部件分层加权组合(第 5 章),并区分整桥与部件评定。M0 采用全桥单层简化:
 * BCI = 100 − Σ(缺陷类型权重 × 严重度权重),再按分值区间映射 1~5 类。
 * M1 拆分为三部件并引入部件权重;数值届时按规范表格重标定。
 */

import type { DefectType, Severity } from './level';

/** 参与评定的「有效发现」(判定正确或严重度偏差的缺陷)。 */
export interface BciFinding {
  type: DefectType;
  severity: Severity;
}

/**
 * 缺陷类型扣分基准权重。
 * 支座脱空最高(直接安全隐患,见 BRIEF 判定规则),剥落露筋次之。
 */
export const BCI_TYPE_WEIGHT: Record<DefectType, number> = {
  bearingVoid: 10,
  spalling: 5,
  crack: 3,
  expansionJoint: 3,
  railingDamage: 2,
  drainageBlock: 2,
  other: 2,
};

/** 严重度放大系数。 */
export const BCI_SEVERITY_WEIGHT: Record<Severity, number> = {
  light: 0.5,
  medium: 1.0,
  severe: 1.5,
};

/** 计算简化 BCI(保留 1 位小数,夹在 [0, 100])。 */
export function computeBci(findings: readonly BciFinding[]): number {
  let deduction = 0;
  for (const f of findings) {
    deduction += BCI_TYPE_WEIGHT[f.type] * BCI_SEVERITY_WEIGHT[f.severity];
  }
  const bci = 100 - deduction;
  return Math.round(Math.max(0, Math.min(100, bci)) * 10) / 10;
}

export type BridgeGrade = 1 | 2 | 3 | 4 | 5;

/** BCI 分值 → 技术状况等级(1 类最好,5 类为危桥)。 */
export function bciToGrade(bci: number): BridgeGrade {
  if (bci >= 95) return 1;
  if (bci >= 80) return 2;
  if (bci >= 66) return 3;
  if (bci >= 50) return 4;
  return 5;
}

/** 等级中文标签(JTG/T H21-2011 术语)。 */
export const GRADE_LABELS: Record<BridgeGrade, string> = {
  1: '一类 · 完好',
  2: '二类 · 良好',
  3: '三类 · 合格',
  4: '四类 · 不合格',
  5: '五类 · 危险',
};

/** 等级对应的处置建议(报告用,占位文案)。 */
export const GRADE_ACTIONS: Record<BridgeGrade, string> = {
  1: '正常保养,按周期例行巡查。',
  2: '正常保养,对轻微缺损安排小修。',
  3: '安排专项检测观测,对明显缺损实施处治。',
  4: '限载限速,尽快实施加固改造设计。',
  5: '封闭交通,启动危桥改造或拆除重建程序。',
};
