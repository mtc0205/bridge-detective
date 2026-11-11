/**
 * 案件注册表(数据驱动案件选择页)。
 *
 * 案件二 / 三 M2 等 Lux3D 解锁后:补一份关卡 JSON(格式与教学关一致,新缺陷类型已就位)+
 * 换对应资产工厂,即可上架——本注册表与案件选择页、入口装配逻辑不用再改。
 */

import { parseLevel } from './level';
import type { DefectType, LevelData } from './level';
import type { LevelAssetFactory } from '../bridge/levelAsset';
import { createBoxGirderAsset } from '../bridge/boxGirder';
import tutorialViaduct from '../levels/tutorial-viaduct.json';

export interface CaseDef {
  id: string;
  /** 卡片角标(教学关 / M2 解锁) */
  tag: string;
  name: string;
  /** 一行元信息(检测点数 · 时限 · 病害类型) */
  meta: string;
  desc: string;
  locked: boolean;
  lockedNote?: string;
  /** 锁定案件的规划病害类型(展示 + 内容排期;数据结构已就位) */
  plannedTypes?: DefectType[];
  /** 关卡加载(锁定案件为 undefined) */
  loadLevel?: () => LevelData;
  /** 资产工厂(锁定案件为 undefined) */
  assetFactory?: LevelAssetFactory;
}

export const CASES: CaseDef[] = [
  {
    id: 'tutorial-viaduct',
    tag: '教学关',
    name: '城市高架 · 教学检测',
    meta: '10 个检测点 · 4 分钟 · 7 类缺陷',
    desc: '三跨预应力混凝土连续箱梁桥,日常定期检测。上桥面、下便道,练习「观察 → 判定 → 定级」的完整流程,并出一份技术状况评定报告。',
    locked: false,
    loadLevel: () => parseLevel(tutorialViaduct),
    assetFactory: createBoxGirderAsset,
  },
  {
    id: 'stone-arch',
    tag: 'M2 解锁',
    name: '山村石拱桥 · 应急检测',
    meta: '暴雨后 24 小时 · 圬工结构',
    desc: '暴雨过后的应急排查:砌石风化、灰缝脱落、拱圈渗水、桥台冲刷,判读圬工拱桥的「带病服役」底线。',
    locked: true,
    lockedNote: '即将解锁 · M2(Lux3D 场景生成中)',
    plannedTypes: ['masonryWeathering', 'mortarLoss', 'stoneLoose', 'seepage', 'scour', 'crack'],
  },
  {
    id: 'qiantang-1937',
    tag: 'M2 解锁 · 旗舰',
    name: '钱塘江大桥 1937 · 桥殇',
    meta: '旗舰案件 · 战损检测 · Lux3D 复原',
    desc: '由历史照片复原通车 89 天即自毁阻敌的双层公铁两用钢桁梁桥:断杆、失铆、构件弯曲,评估可修复性,续写「抗战必胜,此桥必复」。',
    locked: true,
    lockedNote: '即将解锁 · M2(Lux3D 资产生成中)',
    plannedTypes: ['memberFracture', 'rivetMissing', 'buckling', 'corrosion', 'other'],
  },
];

/** 按 id 取可进入案件(锁定 / 未知 id 返回 null)。 */
export function findPlayableCase(id: string): CaseDef | null {
  const def = CASES.find((c) => c.id === id);
  return def && !def.locked && def.loadLevel && def.assetFactory ? def : null;
}
