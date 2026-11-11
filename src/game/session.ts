/**
 * 一局检测会话:热点判定记录、计分、倒计时、BCI 评级与报告生成。
 * 不依赖 THREE / DOM,纯逻辑,便于单元测试。
 *
 * 报告一致性由测试保证:缺陷清单行数 = 热点总数,统计 = 判定记录逐条累加,
 * BCI / 等级 / 处治建议均由同一份 resolutions 数据推导(结算数字与过程一致)。
 */

import { computeBci, bciToGrade, GRADE_LABELS, GRADE_ACTIONS, COMPONENT_WEIGHT, CRITICAL_BCI_CAP } from './bci';
import type { BciFinding, BciResult, BridgeGrade } from './bci';
import { judge } from './scoring';
import type { InspectChoice, Judgment } from './scoring';
import type { HotspotAnswer, HotspotData, LevelData } from './level';
import { DEFECT_TYPE_LABELS, SEVERITY_LABELS, COMPONENT_LABELS } from './level';
import type { BridgeComponent } from './level';
import { repairOf } from './codex';

export interface HotspotResolution {
  hotspotId: string;
  label: string;
  component: BridgeComponent;
  choice: InspectChoice;
  judgment: Judgment;
  truth: HotspotAnswer;
}

/** 报告缺陷清单行(结算页 HTML 报告与 Markdown 报告共用一份数据)。 */
export interface ReportRow {
  index: number;
  label: string;
  component: BridgeComponent;
  /** 玩家判定的类型中文标签(未检测为 null) */
  judgedType: string | null;
  judgedSeverity: 'light' | 'medium' | 'severe' | null;
  verdict: 'correct' | 'decoyPass' | 'severityMiss' | 'falsePositive' | 'missedDefect' | 'typeMiss' | 'unprocessed';
  normNote: string;
  repair: string;
}

export class Session {
  readonly level: LevelData;
  private readonly resolutions = new Map<string, HotspotResolution>();
  private currentScore = 0;
  private remainingSec: number;

  constructor(level: LevelData) {
    this.level = level;
    this.remainingSec = level.timeLimitSec;
  }

  get score(): number {
    return this.currentScore;
  }

  get timeLeft(): number {
    return this.remainingSec;
  }

  get elapsedSec(): number {
    return this.level.timeLimitSec - this.remainingSec;
  }

  /** 倒计时推进(仅在游玩状态下调用)。 */
  tick(dt: number): void {
    this.remainingSec = Math.max(0, this.remainingSec - dt);
  }

  get timeUp(): boolean {
    return this.remainingSec <= 0;
  }

  /** 判定一个热点(重复判定抛错,防止刷分)。 */
  resolve(hotspot: HotspotData, choice: InspectChoice): HotspotResolution {
    if (this.resolutions.has(hotspot.id)) {
      throw new Error(`热点 ${hotspot.id} 已判定,不可重复提交`);
    }
    const judgment = judge(choice, hotspot.answer);
    this.currentScore += judgment.scoreDelta;
    const resolution: HotspotResolution = {
      hotspotId: hotspot.id,
      label: hotspot.label,
      component: hotspot.component,
      choice,
      judgment,
      truth: hotspot.answer,
    };
    this.resolutions.set(hotspot.id, resolution);
    return resolution;
  }

  isResolved(id: string): boolean {
    return this.resolutions.has(id);
  }

  get resolvedCount(): number {
    return this.resolutions.size;
  }

  get allResolved(): boolean {
    return this.resolutions.size >= this.level.hotspots.length;
  }

  getResolutions(): HotspotResolution[] {
    return [...this.resolutions.values()];
  }

  /** 计入 BCI 的有效发现(判定正确或仅严重度偏差)。 */
  confirmedFindings(): BciFinding[] {
    const byId = new Map(this.level.hotspots.map((h) => [h.id, h] as const));
    const findings: BciFinding[] = [];
    for (const r of this.resolutions.values()) {
      if (r.choice.kind === 'defect' && r.judgment.counted) {
        const hotspot = byId.get(r.hotspotId);
        if (hotspot) findings.push({ type: r.choice.type, severity: r.choice.severity, component: hotspot.component });
      }
    }
    return findings;
  }

  get bciResult(): BciResult {
    return computeBci(this.confirmedFindings());
  }

  /** 兼容取值:整体 BCI 数值。 */
  get bci(): number {
    return this.bciResult.overall;
  }

  get grade(): BridgeGrade {
    return bciToGrade(this.bci);
  }

  /** 对照参考:把全部真实缺陷算进去的 BCI(展示漏检对评定的影响)。 */
  get groundTruthBci(): number {
    const findings: BciFinding[] = [];
    for (const h of this.level.hotspots) {
      if (h.answer.type !== 'none') {
        findings.push({ type: h.answer.type, severity: h.answer.severity, component: h.component });
      }
    }
    return computeBci(findings).overall;
  }

  /** 判定计数(用于结算页;resolved = correct + partial + wrong + falsePositive)。 */
  get counts(): { correct: number; partial: number; wrong: number; falsePositive: number; missed: number } {
    let correct = 0;
    let partial = 0;
    let wrong = 0;
    let falsePositive = 0;
    for (const r of this.resolutions.values()) {
      if (r.judgment.kind === 'correct' || r.judgment.kind === 'decoyPass') correct += 1;
      else if (r.judgment.kind === 'severityMiss') partial += 1;
      else if (r.judgment.kind === 'falsePositive') falsePositive += 1;
      else wrong += 1; // typeMiss / missedDefect
    }
    const missed = this.missedHotspots().length;
    return { correct, partial, wrong, falsePositive, missed };
  }

  /** 未被正确识别的真缺陷(含未处理与判错的)。 */
  missedHotspots(): HotspotData[] {
    return this.level.hotspots.filter((h) => {
      if (h.answer.type === 'none') return false; // 诱饵不存在「漏检」
      const r = this.resolutions.get(h.id);
      return r === undefined || !r.judgment.counted;
    });
  }

  /** 误报记录(结算页与报告展示)。 */
  falsePositives(): HotspotResolution[] {
    return this.getResolutions().filter((r) => r.judgment.kind === 'falsePositive');
  }

  /** 报告缺陷清单行(HTML 报告与 Markdown 共用,保证数字一致)。 */
  reportRows(): ReportRow[] {
    return this.level.hotspots.map((h, i) => {
      const r = this.resolutions.get(h.id);
      if (!r) {
        return {
          index: i + 1,
          label: h.label,
          component: h.component,
          judgedType: null,
          judgedSeverity: null,
          verdict: 'unprocessed',
          normNote: h.normNote,
          repair: '—',
        };
      }
      const judgedType = r.choice.kind === 'defect' ? DEFECT_TYPE_LABELS[r.choice.type] : '无缺陷(不标记)';
      const judgedSeverity = r.choice.kind === 'defect' ? r.choice.severity : null;
      const verdict: ReportRow['verdict'] = r.judgment.kind;
      const repair =
        r.choice.kind === 'defect' ? repairOf(r.choice.type, r.choice.severity) : '结构完好,无需处治';
      return { index: i + 1, label: h.label, component: h.component, judgedType, judgedSeverity, verdict, normNote: h.normNote, repair };
    });
  }

  /**
   * 生成 Markdown 检测报告(下载 / 复制用;结算页另有同数据 HTML 版)。
   */
  buildReportMarkdown(now: Date = new Date()): string {
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const bci = this.bciResult;
    const counts = this.counts;
    const lines: string[] = [];
    lines.push(`# 桥梁技术状况评定报告`);
    lines.push('');
    lines.push(`- **工程名称:** ${this.level.caseName}(${this.level.subtitle})`);
    lines.push(`- **检测日期:** ${date}`);
    lines.push(`- **检测人:** 玩家(检测工程师)`);
    lines.push(`- **评定依据:** JTG/T H21-2011《公路桥梁技术状况评定标准》(教学简化)`);
    lines.push(`- **检测用时:** ${Math.floor(this.elapsedSec / 60)} 分 ${Math.round(this.elapsedSec % 60)} 秒 / 限时 ${Math.round(this.level.timeLimitSec / 60)} 分钟`);
    lines.push('');
    lines.push('## 一、缺陷清单');
    lines.push('');
    lines.push('| # | 检测点 | 部位 | 判定结果 | 严重度 | 判定 | 规范依据 | 处治建议 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    const verdictText: Record<ReportRow['verdict'], string> = {
      correct: '✅ 正确',
      decoyPass: '✅ 完好确认',
      severityMiss: '🟡 严重度偏差',
      falsePositive: '❌ 误报',
      missedDefect: '⭕ 漏检(放走真缺陷)',
      typeMiss: '❌ 类型误判',
      unprocessed: '⭕ 未检测',
    };
    for (const row of this.reportRows()) {
      lines.push(
        `| ${row.index} | ${row.label} | ${COMPONENT_LABELS[row.component]} | ${row.judgedType ?? '(未检测)'} | ` +
          `${row.judgedSeverity ? SEVERITY_LABELS[row.judgedSeverity] : '—'} | ${verdictText[row.verdict]} | ` +
          `${row.normNote.replace(/\|/g, '/')} | ${row.repair.replace(/\|/g, '/')} |`,
      );
    }
    lines.push('');
    lines.push('## 二、技术状况评定(三部件加权)');
    lines.push('');
    lines.push('| 部件 | BCI | 权重 |');
    lines.push('| --- | --- | --- |');
    lines.push(`| 桥面系 | ${bci.deck.toFixed(1)} | ${COMPONENT_WEIGHT.deck} |`);
    lines.push(`| 上部结构 | ${bci.superstructure.toFixed(1)} | ${COMPONENT_WEIGHT.superstructure} |`);
    lines.push(`| 下部结构 | ${bci.substructure.toFixed(1)} | ${COMPONENT_WEIGHT.substructure} |`);
    lines.push('');
    lines.push(`- **整体 BCI = ${bci.overall.toFixed(1)}**`);
    if (bci.criticalTrigger) {
      lines.push(`- **触发关键安全隐患条款:** 重级「支座脱空 / 构件断裂」直接压低评定,BCI 上限 ${CRITICAL_BCI_CAP}(四类·不合格)。`);
    }
    lines.push(`- **技术状况等级:${GRADE_LABELS[this.grade]}**`);
    lines.push(`- **处理建议:** ${GRADE_ACTIONS[this.grade]}`);
    lines.push(`- **对照参考:** 若全部实际缺陷计入,BCI = ${this.groundTruthBci.toFixed(1)}(漏检会使评定偏乐观)。`);
    lines.push('');
    lines.push('## 三、漏检与误报');
    lines.push('');
    const missed = this.missedHotspots();
    const fps = this.falsePositives();
    if (missed.length === 0 && fps.length === 0) {
      lines.push('无漏检、无误报,检测记录完整。');
    } else {
      if (missed.length > 0) {
        lines.push(
          `**漏检 ${missed.length} 处:** ${missed
            .map((h) => {
              const truth =
                h.answer.type === 'none'
                  ? '—'
                  : `${DEFECT_TYPE_LABELS[h.answer.type]}·${SEVERITY_LABELS[h.answer.severity]}`;
              return `${h.label}(实际:${truth})`;
            })
            .join(';')}。`,
        );
      }
      if (fps.length > 0) {
        lines.push(`**误报 ${fps.length} 处:** ${fps.map((r) => r.label).join(';')}。`);
      }
    }
    lines.push('');
    lines.push('## 四、检测质量统计');
    lines.push('');
    lines.push(
      `- 判定正确 ${counts.correct} / 严重度偏差 ${counts.partial} / 误判 ${counts.wrong} / 误报 ${counts.falsePositive} / 漏检 ${counts.missed};总得分 ${this.currentScore}。`,
    );
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*危桥侦探 Bridge Detective 生成 · 判定口径见游戏内图鉴(JTG/T H21-2011 简化)*');
    return lines.join('\n');
  }
}
