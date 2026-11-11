import { describe, expect, it } from 'vitest';
import { CASES, findPlayableCase } from './cases';
import { parseLevel, serializeLevel } from './level';
import type { LevelData } from './level';
import { computeBci, bciToGrade } from './bci';
import type { BciFinding } from './bci';

/** 取已解锁案件的关卡(注册表契约:loadLevel 出来的关卡必须通过 parseLevel 全校验)。 */
function playableLevels(): { id: string; level: LevelData }[] {
  return CASES.filter((c) => !c.locked && c.loadLevel).map((c) => ({
    id: c.id,
    level: c.loadLevel!(),
  }));
}

/** 关卡全部真实缺陷 → BCI 发现列表(判别联合在循环里收窄)。 */
function truthFindings(level: LevelData): BciFinding[] {
  const findings: BciFinding[] = [];
  for (const h of level.hotspots) {
    if (h.answer.type !== 'none') {
      findings.push({ type: h.answer.type, severity: h.answer.severity, component: h.component });
    }
  }
  return findings;
}

describe('案件注册表(M2)', () => {
  it('教学关与案件二可玩,未知 id 兜底 null', () => {
    expect(findPlayableCase('tutorial-viaduct')).not.toBeNull();
    expect(findPlayableCase('stone-arch')).not.toBeNull();
    expect(findPlayableCase('not-exist')).toBeNull();
  });

  it.each([
    ['tutorial-viaduct', 8, 4],
    ['stone-arch', 8, 5],
  ])('案件 %s:热点 ≥ %d、缺陷类型 ≥ %d、三部件有布点、含诱饵、时限合理', (id, minHotspots, minTypes) => {
    const level = findPlayableCase(id as string)!.loadLevel!();
    expect(level.hotspots.length).toBeGreaterThanOrEqual(minHotspots);

    const types = new Set<string>();
    for (const h of level.hotspots) {
      if (h.answer.type !== 'none') types.add(h.answer.type);
    }
    expect(types.size, '缺陷类型数').toBeGreaterThanOrEqual(minTypes);

    for (const comp of ['deck', 'superstructure', 'substructure'] as const) {
      expect(level.hotspots.some((h) => h.component === comp), `${id} 缺 ${comp} 布点`).toBe(true);
    }
    expect(level.hotspots.some((h) => h.answer.type === 'none'), '应含完好诱饵').toBe(true);
    expect(level.timeLimitSec).toBeGreaterThanOrEqual(120);
    expect(level.timeLimitSec).toBeLessThanOrEqual(600);
  });

  it('所有可玩关卡:defectTypes 覆盖全部非诱饵答案(玩家可判对)', () => {
    for (const { id, level } of playableLevels()) {
      const scope = new Set(level.defectTypes ?? []);
      for (const h of level.hotspots) {
        if (h.answer.type !== 'none') {
          expect(scope.has(h.answer.type), `${id}/${h.id} 答案不在弹窗范围内`).toBe(true);
        }
      }
    }
  });

  it('所有可玩关卡:序列化 round-trip(编辑器保存格式兼容)', () => {
    for (const { id, level } of playableLevels()) {
      const again = parseLevel(JSON.parse(JSON.stringify(serializeLevel(level))));
      expect(again, id).toEqual(level);
    }
  });

  it('案件二布点核对:风化/灰缝/松动/渗水/冲刷/裂缝/护栏各就各位', () => {
    const level = findPlayableCase('stone-arch')!.loadLevel!();
    const types = new Set<string>();
    for (const h of level.hotspots) {
      if (h.answer.type !== 'none') types.add(h.answer.type);
    }
    for (const t of ['masonryWeathering', 'mortarLoss', 'stoneLoose', 'seepage', 'scour', 'crack', 'railingDamage']) {
      expect(types.has(t), t).toBe(true);
    }
    // 拱石松动(重)与桥台冲刷(重):应急案的「保桥」叙事核心
    expect(level.hotspots.some((h) => h.answer.type === 'stoneLoose' && h.answer.severity === 'severe')).toBe(true);
    expect(level.hotspots.some((h) => h.answer.type === 'scour' && h.answer.severity === 'severe')).toBe(true);
  });

  it('案件二全缺陷计入 → 触发拱石松动条款,四类(限载 + 临时支撑叙事)', () => {
    const level = findPlayableCase('stone-arch')!.loadLevel!();
    const r = computeBci(truthFindings(level));
    expect(r.criticalTrigger).toBe('stoneLoose');
    expect(r.overall).toBeLessThan(66);
    expect(bciToGrade(r.overall)).toBe(4);
  });
});
