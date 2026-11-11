/**
 * 案件注册表(数据驱动案件选择页)。
 *
 * 三案件全部可玩:教学关(箱梁)/ 案件二(石拱)/ 旗舰案件三(钱塘江 1937 钢桁架)。
 * 所有工厂统一经 withLux3dVisuals 包装:关卡 JSON 写 asset.glb 即热切换 Lux3D 视觉,
 * 无该字段或加载失败则保持程序化占位资产。
 */

import { parseLevel } from './level';
import type { DefectType, LevelData } from './level';
import type { LevelAssetFactory } from '../bridge/levelAsset';
import { createBoxGirderAsset } from '../bridge/boxGirder';
import { createStoneArchAsset } from '../bridge/stoneArch';
import { createSteelTrussAsset } from '../bridge/steelTruss';
import { withLux3dVisuals } from '../bridge/gltfAsset';
import tutorialViaduct from '../levels/tutorial-viaduct.json';
import stoneArchEmergency from '../levels/stone-arch-emergency.json';
import qiantang1937 from '../levels/qiantang-1937-bridge.json';

export interface CaseDef {
  id: string;
  /** 卡片角标(教学关 / 案件二 / 旗舰) */
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
    assetFactory: withLux3dVisuals(createBoxGirderAsset),
  },
  {
    id: 'stone-arch',
    tag: '案件二 · 应急',
    name: '山村石拱桥 · 应急检测',
    meta: '10 个检测点 · 4 分钟 · 8 类缺陷',
    desc: '暴雨过后 24 小时的应急排查:砌石风化、灰缝脱落、拱石松动、拱圈渗水、桥台冲刷,判读这座 62 岁圬工拱桥能否限载放行。',
    locked: false,
    loadLevel: () => parseLevel(stoneArchEmergency),
    assetFactory: withLux3dVisuals(createStoneArchAsset),
  },
  {
    id: 'qiantang-1937',
    tag: '旗舰 · 战损检测',
    name: '钱塘江大桥 1937 · 桥殇',
    meta: '12 个检测点 · 5 分钟 · 6 类缺陷',
    desc: '1937 年 12 月 23 日,通车 89 天的大桥自毁阻敌:五孔落江、两墩被毁。登桥评估断杆、失铆、弯杆与支座卡死,回答「此桥可复吗」——含史实尾声卡。',
    locked: false,
    loadLevel: () => parseLevel(qiantang1937),
    assetFactory: withLux3dVisuals(createSteelTrussAsset),
  },
];

/** 按 id 取可进入案件(锁定 / 未知 id 返回 null)。 */
export function findPlayableCase(id: string): CaseDef | null {
  const def = CASES.find((c) => c.id === id);
  return def && !def.locked && def.loadLevel && def.assetFactory ? def : null;
}
