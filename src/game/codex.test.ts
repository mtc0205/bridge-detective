import { describe, expect, it } from 'vitest';
import { CODEX, CODEX_FOOTNOTE, CODEX_GROUPS, codexIntegrityIssues, repairOf } from './codex';
import { DEFECT_TYPES } from './level';

describe('检测图鉴数据完整性(游戏内可查 / 报告处治建议来源)', () => {
  it('16 类缺陷条目齐全,无完整性问题', () => {
    expect(DEFECT_TYPES.length).toBe(16);
    expect(codexIntegrityIssues()).toEqual([]);
  });

  it('图鉴分组恰好覆盖全部类型一次', () => {
    const grouped = CODEX_GROUPS.flatMap((g) => g.types);
    expect(grouped.length).toBe(DEFECT_TYPES.length);
    expect(new Set(grouped).size).toBe(DEFECT_TYPES.length);
  });

  it('关键阈值规则可检索:BRIEF 判定口径在图鉴原文中', () => {
    expect(CODEX.crack.severityRule).toContain('0.2');
    expect(CODEX.crack.severityRule).toContain('0.3');
    expect(CODEX.rivetMissing.severityRule).toContain('3 颗');
    expect(CODEX.bearingVoid.severityRule).toContain('重');
    expect(CODEX.buckling.severityRule).toContain('重');
  });

  it('repairOf 输出处治建议;完好处返回固定文案', () => {
    expect(repairOf('crack', 'severe')).toBe(CODEX.crack.repairs.severe);
    expect(repairOf('none', 'none')).toContain('完好');
    for (const t of DEFECT_TYPES) {
      expect(repairOf(t, 'medium').length, t).toBeGreaterThan(6);
    }
  });

  it('图鉴脚注声明规范简化口径', () => {
    expect(CODEX_FOOTNOTE).toContain('JTG/T H21-2011');
    expect(CODEX_FOOTNOTE).toContain('简化');
  });
});
