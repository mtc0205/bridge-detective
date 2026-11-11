/**
 * 关卡数据模型与解析校验(纯逻辑,可单元测试)。
 *
 * 关卡以 JSON 描述:热点 3D 坐标 + 标准答案 + 规范文案,代码与数据彻底分离,
 * 由内部关卡编辑器(?editor=1)生产,M2 三案件内容直接复用同一格式。
 * 坐标系:桥轴线为 X(西 -> 东),横向为 Z,向上为 Y;与 `src/bridge/boxGirder.ts` 的几何常数一致。
 *
 * 说明:工程启用了 `erasableSyntaxOnly`,枚举一律用 const 数组 + 联合类型表达,不用 enum。
 */

/**
 * 缺陷类型全集(游戏内判定口径,覆盖三案件)。
 * 1~7 为混凝土桥(教学关);8~9 通用;10~12 圬工拱桥;13~16 钢桁梁桥(M2 案件三)。
 * 「无缺陷」不是缺陷类型,答案里单独用 'none' 表达。
 */
export const DEFECT_TYPES = [
  'crack', // 裂缝
  'spalling', // 剥落 / 露筋
  'bearingVoid', // 支座脱空
  'expansionJoint', // 伸缩缝破损
  'railingDamage', // 栏杆破损
  'drainageBlock', // 排水堵塞
  'other', // 其他(坑槽等)
  'seepage', // 渗水 / 钙析
  'scour', // 冲刷 / 掏空
  'masonryWeathering', // 砌石风化
  'mortarLoss', // 灰缝脱落
  'stoneLoose', // 砌石松动
  'memberFracture', // 构件断裂
  'rivetMissing', // 铆钉缺失 / 松动
  'buckling', // 构件弯曲
  'corrosion', // 锈蚀
] as const;

export type DefectType = (typeof DEFECT_TYPES)[number];

/** 热点答案允许的类型:某种缺陷,或 'none'(完好诱饵)。 */
export type AnswerType = DefectType | 'none';

export const SEVERITIES = ['light', 'medium', 'severe'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** 答案允许的严重度:轻/中/重,或 'none'(仅当类型为「无缺陷」时)。 */
export type AnswerSeverity = Severity | 'none';

export const DEFECT_TYPE_LABELS: Record<DefectType, string> = {
  crack: '裂缝',
  spalling: '剥落 / 露筋',
  bearingVoid: '支座脱空',
  expansionJoint: '伸缩缝破损',
  railingDamage: '栏杆破损',
  drainageBlock: '排水堵塞',
  other: '其他(坑槽等)',
  seepage: '渗水 / 钙析',
  scour: '冲刷 / 掏空',
  masonryWeathering: '砌石风化',
  mortarLoss: '灰缝脱落',
  stoneLoose: '砌石松动',
  memberFracture: '构件断裂',
  rivetMissing: '铆钉缺失 / 松动',
  buckling: '构件弯曲',
  corrosion: '锈蚀',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  light: '轻',
  medium: '中',
  severe: '重',
};

/**
 * 结构部件(JTG/T H21-2011 简化三分法):桥面系 / 上部结构 / 下部结构。
 * 支座在实务里可归上部或下部,本作按「桥下检测动线」归下部结构。
 */
export const COMPONENTS = ['deck', 'superstructure', 'substructure'] as const;
export type BridgeComponent = (typeof COMPONENTS)[number];

export const COMPONENT_LABELS: Record<BridgeComponent, string> = {
  deck: '桥面系',
  superstructure: '上部结构',
  substructure: '下部结构',
};

/**
 * 热点标准答案:真缺陷(类型 + 严重度)或完好诱饵('none' / 'none')。
 * 判别联合:类型为 'none' 时严重度必为 'none',反之必为三级严重度之一。
 */
export type HotspotAnswer = { type: DefectType; severity: Severity } | { type: 'none'; severity: 'none' };

export interface HotspotData {
  /** 关卡内唯一 ID,报告与回放引用 */
  id: string;
  /** 展示名 = 纯位置描述(不含缺陷信息,避免向玩家泄底) */
  label: string;
  /** 3D 锚点世界坐标 [x, y, z] */
  position: [number, number, number];
  /** 可交互半径(米),缺省 3.5;高位构件(如支座)可放宽 */
  interactRadius?: number;
  /** 所属结构部件(BCI 分部件加权用) */
  component: BridgeComponent;
  answer: HotspotAnswer;
  /** 近景检测文案(M0 占位,M2 换 Lux3D 损伤贴图细节) */
  description: string;
  /** 规范依据(JTG/T H21-2011 简化条目,判定后展示) */
  normNote: string;
}

export interface SpawnPointData {
  position: [number, number, number];
  /** 朝向角(度):0 朝 -Z,-90 朝 +X(东,桥尾方向) */
  yawDeg: number;
}

export interface LevelData {
  id: string;
  caseName: string;
  subtitle: string;
  /** 案情简介(开场卡) */
  brief: string;
  /**
   * 尾声文案(可选,结算页「尾声」卡):旗舰案件的历史后日谈,
   * 如钱塘江大桥「1948 修复报道 / 1953 全面修复 / 今日服役」。
   */
  epilogue?: string;
  /** 时限(秒) */
  timeLimitSec: number;
  spawn: SpawnPointData;
  hotspots: HotspotData[];
  /**
   * 本关卡检测弹窗展示的缺陷类型范围(缺省 = 全部)。
   * 多案件共用全集时,用该字段把教学关收敛在 7 类,钢桥关收敛在钢构类。
   * 校验保证所有非诱饵热点的答案类型都在此范围内(否则玩家无法判对)。
   */
  defectTypes?: DefectType[];
  /**
   * 视觉资产覆盖(可选,M2 Lux3D):glb 就位后由 gltf 覆盖工厂替换视觉子树,
   * 碰撞 / 出生点 / 检测动线仍用程序化常量(glb 与程序骨架同一坐标系)。
   */
  asset?: { glb: string };
}

/** 关卡 JSON 校验失败时抛出,信息面向关卡编辑器作者。 */
export class LevelFormatError extends Error {
  constructor(message: string) {
    super(`[关卡格式错误] ${message}`);
    this.name = 'LevelFormatError';
  }
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LevelFormatError(`${what} 应为对象`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LevelFormatError(`${what} 应为非空字符串`);
  }
  return value;
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LevelFormatError(`${what} 应为有限数字`);
  }
  return value;
}

function asVec3(value: unknown, what: string): [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    throw new LevelFormatError(`${what} 应为 3 个有限数字 [x, y, z]`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function isOneOf<T extends string>(value: unknown, options: readonly T[], what: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    throw new LevelFormatError(`${what} 应为 ${options.join(' / ')} 之一`);
  }
  return value as T;
}

function parseHotspot(raw: unknown, index: number): HotspotData {
  const h = asRecord(raw, `hotspots[${index}]`);
  const answerRaw = asRecord(h.answer, `hotspots[${index}].answer`);
  const type = isOneOf(answerRaw.type, [...DEFECT_TYPES, 'none'] as const, `hotspots[${index}].answer.type`);
  const severity = isOneOf(
    answerRaw.severity,
    [...SEVERITIES, 'none'] as const,
    `hotspots[${index}].answer.severity`,
  );
  let answer: HotspotAnswer;
  if (type === 'none') {
    if (severity !== 'none') {
      throw new LevelFormatError(`hotspots[${index}] 无缺陷热点的 severity 必须为 'none'`);
    }
    answer = { type: 'none', severity: 'none' };
  } else {
    if (severity === 'none') {
      throw new LevelFormatError(`hotspots[${index}] 缺陷热点的 severity 不能为 'none'`);
    }
    answer = { type, severity };
  }
  const hotspot: HotspotData = {
    id: asString(h.id, `hotspots[${index}].id`),
    label: asString(h.label, `hotspots[${index}].label`),
    position: asVec3(h.position, `hotspots[${index}].position`),
    component: isOneOf(h.component, COMPONENTS, `hotspots[${index}].component`),
    answer,
    description: asString(h.description, `hotspots[${index}].description`),
    normNote: asString(h.normNote, `hotspots[${index}].normNote`),
  };
  if (h.interactRadius !== undefined) {
    const r = asNumber(h.interactRadius, `hotspots[${index}].interactRadius`);
    if (r <= 0 || r > 20) {
      throw new LevelFormatError(`hotspots[${index}].interactRadius 应在 (0, 20] 米内`);
    }
    hotspot.interactRadius = r;
  }
  return hotspot;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 解析并校验关卡 JSON。任何字段不合法都会抛 LevelFormatError,
 * 保证玩法层拿到的 LevelData 一定是完整自洽的。
 */
export function parseLevel(raw: unknown): LevelData {
  const root = asRecord(raw, '关卡根对象');
  const hotspotsRaw = root.hotspots;
  if (!Array.isArray(hotspotsRaw) || hotspotsRaw.length === 0) {
    throw new LevelFormatError('hotspots 应为非空数组');
  }
  const hotspots = hotspotsRaw.map((h, i) => parseHotspot(h, i));
  const ids = new Set<string>();
  for (const h of hotspots) {
    if (ids.has(h.id)) throw new LevelFormatError(`热点 id 重复:${h.id}`);
    ids.add(h.id);
  }

  // —— 缺陷类型范围(可选字段)——
  let defectTypes: DefectType[] | undefined;
  if (root.defectTypes !== undefined) {
    if (!Array.isArray(root.defectTypes) || root.defectTypes.length === 0) {
      throw new LevelFormatError('defectTypes 应为非空字符串数组');
    }
    defectTypes = root.defectTypes.map((t, i) => isOneOf(t, DEFECT_TYPES, `defectTypes[${i}]`));
    const seen = new Set<string>();
    for (const t of defectTypes) {
      if (seen.has(t)) throw new LevelFormatError(`defectTypes 重复:${t}`);
      seen.add(t);
    }
    for (const h of hotspots) {
      if (h.answer.type !== 'none' && !seen.has(h.answer.type)) {
        throw new LevelFormatError(
          `热点 ${h.id} 的答案类型「${h.answer.type}」不在 defectTypes 范围内(玩家将无法判对)`,
        );
      }
    }
  }

  const spawnRaw = asRecord(root.spawn, 'spawn');
  const epilogue = root.epilogue !== undefined ? asString(root.epilogue, 'epilogue') : undefined;
  const asset =
    root.asset !== undefined
      ? { glb: asString(asRecord(root.asset, 'asset').glb, 'asset.glb') }
      : undefined;
  return {
    id: asString(root.id, 'id'),
    caseName: asString(root.caseName, 'caseName'),
    subtitle: asString(root.subtitle, 'subtitle'),
    brief: asString(root.brief, 'brief'),
    epilogue,
    timeLimitSec: asNumber(root.timeLimitSec, 'timeLimitSec'),
    spawn: {
      position: asVec3(spawnRaw.position, 'spawn.position'),
      yawDeg: asNumber(spawnRaw.yawDeg, 'spawn.yawDeg'),
    },
    hotspots,
    defectTypes,
    asset,
  };
}

/**
 * 把 LevelData 序列化回可读 JSON 对象(关卡编辑器「保存」用)。
 * parseLevel(serializeLevel(level)) 与原 level 深度相等(round-trip 测试保证)。
 */
export function serializeLevel(level: LevelData): Record<string, unknown> {
  const hotspots = level.hotspots.map((h) => {
    const out: Record<string, unknown> = {
      id: h.id,
      label: h.label,
      position: [round3(h.position[0]), round3(h.position[1]), round3(h.position[2])],
      component: h.component,
      answer: { type: h.answer.type, severity: h.answer.severity },
      description: h.description,
      normNote: h.normNote,
    };
    if (h.interactRadius !== undefined) out.interactRadius = h.interactRadius;
    return out;
  });
  const out: Record<string, unknown> = {
    id: level.id,
    caseName: level.caseName,
    subtitle: level.subtitle,
    brief: level.brief,
    timeLimitSec: level.timeLimitSec,
    spawn: {
      position: [
        round3(level.spawn.position[0]),
        round3(level.spawn.position[1]),
        round3(level.spawn.position[2]),
      ],
      yawDeg: level.spawn.yawDeg,
    },
    hotspots,
  };
  if (level.epilogue) out.epilogue = level.epilogue;
  if (level.defectTypes) out.defectTypes = [...level.defectTypes];
  if (level.asset) out.asset = { glb: level.asset.glb };
  return out;
}
