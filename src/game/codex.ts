/**
 * 检测图鉴(纯数据,可单元测试)。
 *
 * 判定规则简化自 JTG/T H21-2011《公路桥梁技术状况评定标准》,数值为教学口径;
 * 工程实践以现行规范原文为准。图鉴在游戏内按 G 随时查阅,也是结算报告
 * 「处治建议」列的数据来源——保证判定口径与报告结论一致。
 */

import type { DefectType, Severity } from './level';
import { DEFECT_TYPES } from './level';

/** 图鉴分组(展示顺序)。 */
export const CODEX_GROUPS: readonly { key: string; title: string; types: DefectType[] }[] = [
  {
    key: 'common',
    title: '通用病害(各桥型)',
    types: ['crack', 'bearingVoid', 'expansionJoint', 'railingDamage', 'drainageBlock', 'seepage', 'scour', 'other'],
  },
  {
    key: 'concrete',
    title: '混凝土桥(教学关)',
    types: ['spalling'],
  },
  {
    key: 'masonry',
    title: '圬工拱桥(M2 案件二)',
    types: ['masonryWeathering', 'mortarLoss', 'stoneLoose'],
  },
  {
    key: 'steel',
    title: '钢桁梁桥(M2 案件三)',
    types: ['memberFracture', 'rivetMissing', 'buckling', 'corrosion'],
  },
];

export interface CodexEntry {
  /** 观察要点:怎么在近景里认出它 */
  identify: string;
  /** 严重度分级规则(简化规范条目) */
  severityRule: string;
  /** 轻 / 中 / 重 对应的处治建议(报告「处治建议」列) */
  repairs: Record<Severity, string>;
}

export const CODEX: Record<DefectType, CodexEntry> = {
  crack: {
    identify: '沿构件表面查找线状缝隙:注意缝宽、走向(纵向 / 横向 / 网状 / 径向)、缝缘有无渗水钙析;可用裂缝宽度卡对比读数。',
    severityRule: '缝宽 <0.2mm 可不登记;≥0.2mm 需登记;≥0.3mm 或贯穿分布 / 受力裂缝判「重」。网状裂缝按分布面积综合评定。',
    repairs: {
      light: '表面封闭涂刷(环氧胶泥),纳入日常观测。',
      medium: '低压注胶封闭,标记编号并定期复测缝宽。',
      severe: '专项检算查明成因,粘贴钢板 / 碳纤维或加固处治。',
    },
  },
  spalling: {
    identify: '敲击有空鼓声的表层混凝土成片脱落;关注露筋范围、钢筋锈蚀深度与截面削弱程度。',
    severityRule: '局部浅层剥落未露筋判「轻」;成片剥落露筋、锈蚀扩展判「中」;面积大或主筋明显锈蚀削弱判「重」。',
    repairs: {
      light: '凿除疏松层,砂浆修补找平。',
      medium: '凿除至密实面,除锈后用聚合物砂浆修复保护层。',
      severe: '除锈阻锈处理,必要时置换混凝土并复核截面承载力。',
    },
  },
  bearingVoid: {
    identify: '仰视支座:看橡胶是否老化压溃、有无偏位;支座与梁底之间能否塞入塞尺 / 可见透光缝隙。',
    severityRule: '一经确认脱空即判「重」(直接安全隐患)——本作简化口径,不设轻 / 中档。',
    repairs: {
      light: '(按规范口径,支座脱空不设轻度)复测确认,严密切观。',
      medium: '(按规范口径,支座脱空不设中度)加强观测并限载。',
      severe: '立即限载限速,顶梁更换支座并调平支座垫石。',
    },
  },
  expansionJoint: {
    identify: '过车听异响、看跳动;近景检查橡胶止水带是否老化断裂、锚固混凝土有无压碎露骨。',
    severityRule: '填缝材料老化但功能尚可判「轻」;止水带断裂失效、锚固区破损判「中」;锚固混凝土压碎 / 错台影响行车判「重」。',
    repairs: {
      light: '清理缝内杂物,更换老化填缝料。',
      medium: '列入养护计划,整段更换止水带并修复锚固区。',
      severe: '尽快更换整条伸缩缝装置,临时铺设钢板过渡。',
    },
  },
  railingDamage: {
    identify: '看栏杆有无刮擦掉角、裂缝、错位松动;手推判断是否失稳;注意根部混凝土与排水孔周边。',
    severityRule: '表层刮擦 / 掉角判「轻」;保护层剥落露筋判「中」;栏杆松动失稳或大段破损判「重」。',
    repairs: {
      light: '砂浆修补表层缺损,保持线形顺直。',
      medium: '除锈修复露筋段,恢复保护层。',
      severe: '更换或加固失稳段,增设临时防护。',
    },
  },
  drainageBlock: {
    identify: '看排水孔有无泥沙杂物堵塞、桥面积水痕迹(水线、青苔);雨后看漫流路径。',
    severityRule: '排水不畅判「轻」;排水孔堵死、积水沿路缘漫流判「中」;排水系统失效、长期浸湿结构判「重」。',
    repairs: {
      light: '疏通清淤,恢复排水坡度。',
      medium: '高压水疏通全部排水孔,清理集水槽。',
      severe: '改造排水系统(增设泄水孔 / 导水槽),消除积水浸湿。',
    },
  },
  other: {
    identify: '不落入前述类型的病害:桥面坑槽、泛白、附属设施缺损等;按影响范围与深度综合判断。',
    severityRule: '浅表层、不影响结构判「轻」;伤及铺装基层 / 构件表层判「中」;结构性破损或影响行车安全判「重」。',
    repairs: {
      light: '纳入日常养护,热补冷补找平。',
      medium: '铣刨重铺损伤区域,修复基层。',
      severe: '查明范围后专项修复,必要时限载。',
    },
  },
  seepage: {
    identify: '看结构表面湿斑、白色钙析(石灰析出)、苔藓水线;辨明水源是桥面渗下还是结构内部。',
    severityRule: '局部湿斑钙析判「轻」;持续渗水判「中」;漏水成线、混浊带土判「重」。',
    repairs: {
      light: '标注湿斑范围,复查对应桥面防水层。',
      medium: '桥面防水修补 + 结构表面封闭。',
      severe: '查明渗漏通道,注浆堵漏并评估内部损伤。',
    },
  },
  scour: {
    identify: '桥下看基础周边有无淘空、外露;护坡有无下沉开裂;对水位线痕迹与冲刷坑做对比。',
    severityRule: '基础边缘轻微冲刷判「轻」;局部掏空、基础外露判「中」;基础悬空或伴随墩台沉降倾斜判「重」。',
    repairs: {
      light: '抛石护基,汛前复测河床标高。',
      medium: '抛石 / 石笼防护,加密观测。',
      severe: '立即限载,实施围堰基础的加固处治。',
    },
  },
  masonryWeathering: {
    identify: '看砌石表面酥化、层状剥落与灰缝状态;锤击听声辨密实程度。',
    severityRule: '表面风化剥落判「轻」;深度风化成片判「中」;截面明显削弱、影响承载判「重」。',
    repairs: {
      light: '勾缝修补,清理风化屑。',
      medium: '剔补风化砌石,重新勾缝。',
      severe: '局部拆砌或加设套拱 / 护壁加固。',
    },
  },
  mortarLoss: {
    identify: '看灰缝(砌缝)有无酥化、脱落、植物滋生;用钩刀探查灰缝饱满度。',
    severityRule: '局部灰缝酥化脱落判「轻」;成段失灰判「中」;大面积失灰、砌体松散判「重」。',
    repairs: {
      light: '清缝后重新勾缝(水泥砂浆)。',
      medium: '全面重新勾缝,清除植物根系。',
      severe: '压力灌浆补强砌体,必要时局部拆砌。',
    },
  },
  stoneLoose: {
    identify: '看个别砌石有无外鼓、错位、松动;敲击辨空响;重点查拱圈与拱脚。',
    severityRule: '个别砌石松动判「轻」;多处松动渗水判「中」;拱圈砌石松动 / 压碎判「重」(立即支撑)。',
    repairs: {
      light: '复位固定松动砌石,恢复勾缝。',
      medium: '拆砌松动区,坐浆复位。',
      severe: '立即设临时支撑,限载并专项加固拱圈。',
    },
  },
  memberFracture: {
    identify: '沿构件全长查断裂、裂纹、缺失段;对照桁架图看杆件是否齐全、有无坠落风险。',
    severityRule: '截面裂纹未断判「中」;构件断裂 / 缺失段(断杆)判「重」——直接危及整体安全。',
    repairs: {
      light: '(断裂类病害不设轻度)复测确认位置。',
      medium: '裂纹钻止裂孔,补焊或增设拼接板。',
      severe: '立即封闭交通,更换 / 复位杆件并验算体系。',
    },
  },
  rivetMissing: {
    identify: '节点板处逐颗查铆钉 / 螺栓:看钉头有无缺失、松动(锤击哑声)、锈蚀断头。',
    severityRule: '单颗缺失 / 松动判「轻」;同一节点 2 颗判「中」;同一节点 ≥3 颗判「重」(节点承载力受损)。',
    repairs: {
      light: '登记编号,更换补齐缺失铆钉(高强度螺栓替代)。',
      medium: '补铆并复紧周边钉群。',
      severe: '节点加固(增设拼接板 / 补铆),复算节点承载。',
    },
  },
  buckling: {
    identify: '顺杆件轴线目视检查直线度:有无目视可见的弯曲、扭曲、凹陷;对照相邻杆件基准线。',
    severityRule: '仪器量测级初弯曲(目视不可见)判「轻 / 中」;目视可见弯曲变形判「重」(压杆稳定受损)。',
    repairs: {
      light: '记录初始弯曲值,纳入观测。',
      medium: '复核长细比与应力,必要时加固。',
      severe: '限载并更换或增设辅杆卸载,复核整体稳定。',
    },
  },
  corrosion: {
    identify: '看涂层破损处的锈蚀形态:浮锈、层锈起皮、锈坑;查截面削弱与孔洞(尤其栓焊节点与积水区)。',
    severityRule: '表面浮锈判「轻」;层状锈蚀起皮判「中」;截面明显削弱、锈坑连通或存在孔洞判「重」。',
    repairs: {
      light: '除锈补涂,恢复涂层体系。',
      medium: '喷砂除锈后重涂,测厚记录。',
      severe: '评估截面削弱,补强板 / 更换构件并全面重涂。',
    },
  },
};

/** 图鉴脚注(页面与报告共用)。 */
export const CODEX_FOOTNOTE =
  '依据 JTG/T H21-2011《公路桥梁技术状况评定标准》简化整理,数值为教学口径;工程实践以现行规范原文为准。';

/** 取某缺陷某严重度的处治建议(报告「处治建议」列;完好处返回固定文案)。 */
export function repairOf(type: DefectType | 'none', severity: Severity | 'none'): string {
  if (type === 'none' || severity === 'none') return '结构完好,无需处治';
  return CODEX[type].repairs[severity];
}

/** 数据完整性自检:每个类型都有图鉴条目且三分级处治建议齐全(测试用)。 */
export function codexIntegrityIssues(): string[] {
  const issues: string[] = [];
  for (const t of DEFECT_TYPES) {
    const entry = CODEX[t];
    if (!entry) {
      issues.push(`${t} 缺少图鉴条目`);
      continue;
    }
    for (const sev of ['light', 'medium', 'severe'] as const) {
      const text = entry.repairs[sev];
      if (typeof text !== 'string' || text.length < 6) issues.push(`${t}.${sev} 处治建议缺失`);
    }
    if (entry.identify.length < 10) issues.push(`${t} 观察要点过短`);
    if (entry.severityRule.length < 10) issues.push(`${t} 分级规则过短`);
  }
  // 分组应恰好覆盖全部类型一次
  const grouped = CODEX_GROUPS.flatMap((g) => g.types);
  const unique = new Set(grouped);
  if (grouped.length !== DEFECT_TYPES.length || unique.size !== DEFECT_TYPES.length) {
    issues.push('图鉴分组未恰好覆盖全部缺陷类型');
  }
  return issues;
}
