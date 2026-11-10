/**
 * 一局检测会话:热点判定记录、计分、倒计时、BCI 评级与报告生成。
 * 不依赖 THREE / DOM,纯逻辑,便于单元测试。
 */

import { computeBci, bciToGrade, GRADE_LABELS, GRADE_ACTIONS } from './bci';
import type { BciFinding, BridgeGrade } from './bci';
import { judge } from './scoring';
import type { InspectChoice, Judgment } from './scoring';
import type { HotspotAnswer, HotspotData, LevelData } from './level';
import { DEFECT_TYPE_LABELS, SEVERITY_LABELS } from './level';

export interface HotspotResolution {
  hotspotId: string;
  label: string;
  choice: InspectChoice;
  judgment: Judgment;
  truth: HotspotAnswer;
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
    const findings: BciFinding[] = [];
    for (const r of this.resolutions.values()) {
      if (r.choice.kind === 'defect' && r.judgment.counted) {
        findings.push({ type: r.choice.type, severity: r.choice.severity });
      }
    }
    return findings;
  }

  get bci(): number {
    return computeBci(this.confirmedFindings());
  }

  get grade(): BridgeGrade {
    return bciToGrade(this.bci);
  }

  /** 判定计数(用于结算页)。 */
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

  /**
   * 生成 Markdown 检测报告(M0 先输出文本到页面)。
   * TODO(M1): 导出 .md 文件 + 浏览器打印 PDF 样式;补充检测人/桩号/照片编号。
   */
  buildReportMarkdown(now: Date = new Date()): string {
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const lines: string[] = [];
    lines.push(`# 桥梁技术状况评定报告(教学 · 占位版)`);
    lines.push('');
    lines.push(`- **工程名称:** ${this.level.caseName}(${this.level.subtitle})`);
    lines.push(`- **检测日期:** ${date}`);
    lines.push(`- **检测人:** 玩家(检测工程师)`);
    lines.push(`- **评定依据:** JTG/T H21-2011《公路桥梁技术状况评定标准》(简化)`);
    lines.push('');
    lines.push('## 一、缺陷清单');
    lines.push('');
    lines.push('| # | 检测点 | 判定结果 | 严重度 | 判定 | 规范依据 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    let index = 1;
    const verdictOf = (r: HotspotResolution): string => {
      switch (r.judgment.kind) {
        case 'correct':
          return '✅ 正确';
        case 'decoyPass':
          return '✅ 完好确认';
        case 'severityMiss':
          return '🟡 严重度偏差';
        case 'falsePositive':
          return '❌ 误报';
        case 'missedDefect':
          return '⭕ 漏检';
        default:
          return '❌ 类型误判';
      }
    };
    for (const h of this.level.hotspots) {
      const r = this.resolutions.get(h.id);
      if (r) {
        const judged =
          r.choice.kind === 'defect'
            ? `${DEFECT_TYPE_LABELS[r.choice.type]}`
            : '无缺陷(不标记)';
        const severity =
          r.choice.kind === 'defect' ? SEVERITY_LABELS[r.choice.severity] : '—';
        const norm = h.normNote.replace(/\|/g, '/');
        lines.push(`| ${index} | ${h.label} | ${judged} | ${severity} | ${verdictOf(r)} | ${norm} |`);
      } else {
        lines.push(`| ${index} | ${h.label} | (未检测) | — | ⭕ 未处理 | — |`);
      }
      index += 1;
    }
    lines.push('');
    lines.push('## 二、技术状况评定');
    lines.push('');
    lines.push(`- **简化 BCI = ${this.bci.toFixed(1)}**`);
    lines.push(`- **技术状况等级:${GRADE_LABELS[this.grade]}**`);
    lines.push(`- **处理建议:** ${GRADE_ACTIONS[this.grade]}`);
    lines.push('');
    lines.push('> 注:M0 采用全桥单层简化算法;M1 按 JTG/T H21-2011 拆分桥面系/上部/下部三部件加权。');
    lines.push('');
    lines.push('## 三、漏检与误报');
    lines.push('');
    const missed = this.missedHotspots();
    if (missed.length === 0 && this.falsePositives().length === 0) {
      lines.push('无漏检、无误报,检测记录完整。');
    } else {
      if (missed.length > 0) {
        lines.push(`**漏检 ${missed.length} 处:** ${missed.map((h) => {
          const type = h.answer.type === 'none' ? '—' : DEFECT_TYPE_LABELS[h.answer.type];
          const sev = h.answer.severity === 'none' ? '—' : SEVERITY_LABELS[h.answer.severity];
          return `${h.label}(实际:${type}·${sev})`;
        }).join(';')}。`);
      }
      const fps = this.falsePositives();
      if (fps.length > 0) {
        lines.push(`**误报 ${fps.length} 处:** ${fps.map((r) => r.label).join(';')}。`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`*危桥侦探 Bridge Detective · M0 骨架生成,报告版式 M1 完善*`);
    return lines.join('\n');
  }
}
