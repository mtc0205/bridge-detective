/**
 * 桥梁技术状况评定 BCI(简化版,纯逻辑,可单元测试)。
 *
 * M1 按 JTG/T H21-2011 第 5 章的思路拆分为三部件加权:
 *   桥面系 0.2 / 上部结构 0.4 / 下部结构 0.4(权重为教学简化,结构重于桥面系)
 * 部件 BCI = 100 − Σ(缺陷类型权重 × 严重度系数),整体 BCI = Σ(部件 BCI × 部件权重)。
 *
 * 关键安全隐患条款(简化自「严重影响安全的缺损可直接评定为不合格」):
 *   支座脱空·重 或 构件断裂·重 → 整体 BCI 上限 57(压入四类·不合格),
 *   对应 BRIEF「支座脱空 = 直接安全隐患」的判定规则,让漏检后果可见。
 */

import type { BridgeComponent } from './level';
import type { DefectType, Severity } from './level';

/** 参与评定的「有效发现」(判定正确或严重度偏差的缺陷),带所属部件。 */
export interface BciFinding {
  type: DefectType;
  severity: Severity;
  component: BridgeComponent;
}

/**
 * 缺陷类型扣分基准权重(部件内扣分,severity light/medium/severe × 0.5/1.0/1.5)。
 * 支座脱空、构件断裂最高(直接安全隐患);冲刷/弯曲次之;桥面系病害较低。
 */
export const BCI_TYPE_WEIGHT: Record<DefectType, number> = {
  bearingVoid: 30,
  memberFracture: 30,
  scour: 24,
  buckling: 24,
  spalling: 15,
  stoneLoose: 15,
  mortarLoss: 12,
  rivetMissing: 12,
  crack: 9,
  expansionJoint: 9,
  masonryWeathering: 9,
  corrosion: 9,
  railingDamage: 6,
  drainageBlock: 6,
  seepage: 6,
  other: 6,
};

/** 严重度放大系数。 */
export const BCI_SEVERITY_WEIGHT: Record<Severity, number> = {
  light: 0.5,
  medium: 1.0,
  severe: 1.5,
};

/** 部件权重(桥面系 0.2 / 上部 0.4 / 下部 0.4)。 */
export const COMPONENT_WEIGHT: Record<BridgeComponent, number> = {
  deck: 0.2,
  superstructure: 0.4,
  substructure: 0.4,
};

/** 触发「关键安全隐患条款」的缺陷(重级)。 */
export const CRITICAL_RULES: readonly { type: DefectType; note: string }[] = [
  { type: 'bearingVoid', note: '支座脱空(重)属直接安全隐患,应立即限载并更换支座' },
  { type: 'memberFracture', note: '主要构件断裂(重)已危及整体安全,应立即封闭交通' },
];

/** 关键隐患触发后的整体 BCI 上限(压入四类·不合格)。 */
export const CRITICAL_BCI_CAP = 57;

/**
 * 主要部件拖累系数:简化自「上部/下部结构评为五类时,整桥应评为五类」条款。
 * 整体 BCI 不得高于 min(上部, 下部) + 该系数,防止加权平均稀释单一主构件的坍塌。
 */
export const MAIN_COMPONENT_DRAG = 15;

export interface BciResult {
  overall: number;
  deck: number;
  superstructure: number;
  substructure: number;
  /** 触发关键安全隐患条款的缺陷类型(未触发为 null) */
  criticalTrigger: DefectType | null;
}

const round1 = (n: number): number => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;

function componentBci(findings: readonly BciFinding[], component: BridgeComponent): number {
  let deduction = 0;
  for (const f of findings) {
    if (f.component === component) deduction += BCI_TYPE_WEIGHT[f.type] * BCI_SEVERITY_WEIGHT[f.severity];
  }
  return round1(100 - deduction);
}

/** 计算三部件加权 BCI(每项保留 1 位小数,夹在 [0, 100])。 */
export function computeBci(findings: readonly BciFinding[]): BciResult {
  const deck = componentBci(findings, 'deck');
  const superstructure = componentBci(findings, 'superstructure');
  const substructure = componentBci(findings, 'substructure');
  let overall =
    deck * COMPONENT_WEIGHT.deck +
    superstructure * COMPONENT_WEIGHT.superstructure +
    substructure * COMPONENT_WEIGHT.substructure;

  // —— 主要部件拖累:整体不得显著高于最差主要部件 ——
  const mainFloor = Math.min(superstructure, substructure) + MAIN_COMPONENT_DRAG;
  overall = Math.min(overall, mainFloor);

  // —— 关键安全隐患条款:重级支座脱空 / 构件断裂 → 整体 BCI 上限 ——
  let criticalTrigger: DefectType | null = null;
  for (const rule of CRITICAL_RULES) {
    if (findings.some((f) => f.type === rule.type && f.severity === 'severe')) {
      criticalTrigger = rule.type;
      break;
    }
  }
  if (criticalTrigger !== null) overall = Math.min(overall, CRITICAL_BCI_CAP);

  return { overall: round1(overall), deck, superstructure, substructure, criticalTrigger };
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

/** 等级对应的处置建议(报告用)。 */
export const GRADE_ACTIONS: Record<BridgeGrade, string> = {
  1: '正常保养,按周期例行巡查。',
  2: '正常保养,对轻微缺损安排小修。',
  3: '安排专项检测观测,对明显缺损实施处治。',
  4: '限载限速,尽快实施加固改造设计。',
  5: '封闭交通,启动危桥改造或拆除重建程序。',
};
