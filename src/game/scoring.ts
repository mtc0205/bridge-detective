/**
 * 判定与计分(纯逻辑,可单元测试)。
 *
 * 计分规则为 BRIEF v1 简化版;规范分级口径(裂缝 0.2/0.3mm 阈值、铆钉分级、
 * 支座脱空即重等)已沉淀到 `src/game/codex.ts` 图鉴与各热点 normNote,
 * 关卡答案即按该口径标定。M3 候选:量测小游戏(裂缝宽度尺)输出实测值映射严重度。
 */

import { DEFECT_TYPE_LABELS, SEVERITY_LABELS } from './level';
import type { DefectType, HotspotAnswer, Severity } from './level';

/** 玩家在检测弹窗里的一次选择:判定为某缺陷(类型+严重度),或判定无缺陷。 */
export type InspectChoice =
  | { kind: 'defect'; type: DefectType; severity: Severity }
  | { kind: 'noDefect' };

export type JudgmentKind =
  | 'correct' // 类型 + 严重度全对
  | 'severityMiss' // 类型对,严重度偏差
  | 'typeMiss' // 真缺陷但类型判错
  | 'missedDefect' // 真缺陷被放走(选了「无缺陷」)
  | 'falsePositive' // 完好处被误标为缺陷
  | 'decoyPass'; // 完好诱饵被正确排除

export interface Judgment {
  kind: JudgmentKind;
  /** 是否计入 BCI 的「有效发现」 */
  counted: boolean;
  scoreDelta: number;
  heading: string;
  detail: string;
}

/** 简化计分表(BRIEF v1)。 */
export const SCORE_RULES = {
  /** 类型+严重度全对 */
  fullMatch: 100,
  /** 类型对、严重度偏 */
  severityPartial: 40,
  /** 真缺陷类型判错 */
  wrongType: 0,
  /** 真缺陷被放走 */
  missedDefect: 0,
  /** 完好处误标(诱饵)扣分 */
  decoyFalsePositive: -50,
  /** 完好诱饵正确排除 */
  decoyCorrectPass: 100,
} as const;

function truthText(truth: HotspotAnswer): string {
  if (truth.type === 'none') return '结构完好';
  return `${DEFECT_TYPE_LABELS[truth.type]} · ${SEVERITY_LABELS[truth.severity]}`;
}

/** 对照标准答案评判玩家的一次检测选择。 */
export function judge(choice: InspectChoice, truth: HotspotAnswer): Judgment {
  // —— 完好诱饵 ——
  if (truth.type === 'none') {
    if (choice.kind === 'noDefect') {
      return {
        kind: 'decoyPass',
        counted: false,
        scoreDelta: SCORE_RULES.decoyCorrectPass,
        heading: '判断正确:此处结构完好',
        detail: '排除了一个「看似有问题」的干扰点。检测哲学:不确定就不标,避免误报。',
      };
    }
    return {
      kind: 'falsePositive',
      counted: false,
      scoreDelta: SCORE_RULES.decoyFalsePositive,
      heading: '误报:此处无缺陷',
      detail: `把完好部位标成了「${DEFECT_TYPE_LABELS[choice.type]}」,扣 ${SCORE_RULES.decoyFalsePositive} 分。`,
    };
  }

  // —— 真缺陷(判别联合:type 非 none → severity 为三级之一)——
  const truthSeverity: Severity = truth.severity;
  if (choice.kind === 'noDefect') {
    return {
      kind: 'missedDefect',
      counted: false,
      scoreDelta: SCORE_RULES.missedDefect,
      heading: '漏检:该处实际存在缺陷',
      detail: `标准答案:${truthText(truth)}。近距离观察特征后再下结论。`,
    };
  }
  if (choice.type !== truth.type) {
    return {
      kind: 'typeMiss',
      counted: false,
      scoreDelta: SCORE_RULES.wrongType,
      heading: '缺陷类型误判',
      detail: `你判「${DEFECT_TYPE_LABELS[choice.type]}」,实际为:${truthText(truth)}。`,
    };
  }
  if (choice.severity !== truth.severity) {
    return {
      kind: 'severityMiss',
      counted: true,
      scoreDelta: SCORE_RULES.severityPartial,
      heading: '类型正确,严重度有偏差',
      detail: `实际严重度为「${SEVERITY_LABELS[truthSeverity]}」,部分计分。`,
    };
  }
  return {
    kind: 'correct',
    counted: true,
    scoreDelta: SCORE_RULES.fullMatch,
    heading: '判定正确',
    detail: `${DEFECT_TYPE_LABELS[choice.type]} · ${SEVERITY_LABELS[choice.severity]},与规范评定一致。`,
  };
}
