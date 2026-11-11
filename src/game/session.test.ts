import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import type { HotspotData } from './level';
import type { InspectChoice } from './scoring';
import { Session } from './session';
import tutorialRaw from '../levels/tutorial-viaduct.json';

const level = parseLevel(tutorialRaw);

/** 按「全部判对」生成选择。 */
const correctChoice = (h: HotspotData): InspectChoice =>
  h.answer.type === 'none'
    ? { kind: 'noDefect' }
    : { kind: 'defect', type: h.answer.type, severity: h.answer.severity };

describe('Session 端到端:判对整关(BRIEF 验收「结算报告数字与过程一致」)', () => {
  it('10 个热点全部判对 → 得分 1000,BCI 55 / 四类,报告行数与热点数一致', () => {
    const s = new Session(level);
    for (const h of level.hotspots) s.resolve(h, correctChoice(h));

    expect(s.resolvedCount).toBe(10);
    expect(s.allResolved).toBe(true);
    expect(s.score).toBe(1000); // 10 × 100(含诱饵正确排除)

    const counts = s.counts;
    expect(counts.correct).toBe(10);
    expect(counts.wrong + counts.partial + counts.falsePositive + counts.missed).toBe(0);
    expect(counts.correct + counts.partial + counts.wrong + counts.falsePositive).toBe(s.resolvedCount);

    // BCI:教学关真实状况 = 四类(下部 40,主要部件拖累 + 支座脱空条款)
    expect(s.bciResult.criticalTrigger).toBe('bearingVoid');
    expect(s.bci).toBe(55);
    expect(s.grade).toBe(4);
    expect(s.groundTruthBci).toBe(55); // 全找到 → 玩家评定 = 实际状况

    // 报告一致性:清单行数 = 热点数;统计数字在报告里可对上
    const rows = s.reportRows();
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.verdict === 'correct' || r.verdict === 'decoyPass')).toBe(true);
    const md = s.buildReportMarkdown();
    expect(md).toContain('检测质量统计');
    expect(md).toContain('判定正确 10');
    expect(md).toContain(`总得分 ${s.score}`);
    expect(md).toContain('整体 BCI = 55.0');
    expect(md).toContain('四类 · 不合格');
    expect(md).toContain('触发关键安全隐患条款');
    const tableRows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| #') && !l.startsWith('| ---'));
    expect(tableRows).toHaveLength(10 + 1 + 3); // 10 清单行 + 部件表头 + 3 部件行
  });

  it('每行都有处治建议(来自图鉴),规范依据为热点 normNote', () => {
    const s = new Session(level);
    for (const h of level.hotspots) s.resolve(h, correctChoice(h));
    for (const row of s.reportRows()) {
      expect(row.repair.length).toBeGreaterThan(5);
      expect(row.normNote.length).toBeGreaterThan(4);
    }
  });
});

describe('Session 漏检 / 误报路径', () => {
  it('只处理部分热点 → 未处理点计入漏检,BCI 偏乐观且有对照参考', () => {
    const s = new Session(level);
    // 只判对桥面系几个点,支座脱空(关键隐患)被漏掉
    for (const h of level.hotspots.filter((x) => x.component === 'deck' && x.answer.type !== 'none').slice(0, 3)) {
      s.resolve(h, correctChoice(h));
    }
    expect(s.resolvedCount).toBe(3);
    const missed = s.missedHotspots();
    expect(missed.length).toBe(9 - 3); // 9 个真缺陷 - 3 个已判对
    expect(missed.some((h) => h.answer.type === 'bearingVoid')).toBe(true);
    expect(s.bciResult.criticalTrigger).toBeNull(); // 漏掉支座脱空 → 条款未触发
    expect(s.bci).toBeGreaterThan(s.groundTruthBci); // 漏检 → 评定偏乐观
    const md = s.buildReportMarkdown();
    expect(md).toContain(`漏检 ${missed.length} 处`);
    expect(md).toContain(`BCI = ${s.groundTruthBci.toFixed(1)}`);
  });

  it('把诱饵标成缺陷 → 误报扣分,报告含误报小节', () => {
    const s = new Session(level);
    const decoy = level.hotspots.find((h) => h.answer.type === 'none');
    if (!decoy) throw new Error('教学关应含诱饵');
    s.resolve(decoy, { kind: 'defect', type: 'crack', severity: 'medium' });
    expect(s.score).toBe(-50);
    expect(s.counts.falsePositive).toBe(1);
    expect(s.falsePositives()).toHaveLength(1);
    const md = s.buildReportMarkdown();
    expect(md).toContain('误报 1 处');
    expect(md).toContain(decoy.label);
  });

  it('严重度偏差计入 BCI(部分发现),类型误判不计入', () => {
    const s = new Session(level);
    const long = level.hotspots.find((h) => h.id === 'crack-longitudinal');
    const bearing = level.hotspots.find((h) => h.id === 'bearing-void-pier1');
    if (!long || !bearing) throw new Error('布点缺失');
    s.resolve(long, { kind: 'defect', type: 'crack', severity: 'light' }); // 偏差 +40,计 BCI
    s.resolve(bearing, { kind: 'defect', type: 'spalling', severity: 'severe' }); // 误判 +0,不计
    expect(s.score).toBe(40);
    expect(s.confirmedFindings()).toHaveLength(1);
    expect(s.counts.partial).toBe(1);
    expect(s.counts.wrong).toBe(1);
  });

  it('重复判定抛错(防刷分)', () => {
    const s = new Session(level);
    const h = level.hotspots[0];
    if (!h) throw new Error('unreachable');
    s.resolve(h, correctChoice(h));
    expect(() => s.resolve(h, correctChoice(h))).toThrow(/不可重复提交/);
  });
});
