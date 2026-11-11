/**
 * 日落倒计时光影(M3):时间压力氛围,纯数据插值(可单元测试)。
 *
 * 每案件一组氛围预设:随时限消耗(k: 0→1)把雾色 / 雾距 / 平行光色温与强度 /
 * 半球光强度分段插值到「终局」状态(教学关 白天→傍晚;石拱桥 暴雨铅灰→更深雨暮;
 * 钢桥 黄昏硝烟→夜战残照)。CSS 叠加层(暖/冷色罩)补天色渐变,不动天空贴图。
 *
 * 插值曲线:前 60% 缓变,后 40% 加速收敛(戏剧压力),均为线性分段,无状态。
 */

export type AtmospherePreset = 'day' | 'storm' | 'war';

export interface AtmosphereValues {
  /** 平行光(太阳)颜色 */
  sunColor: number;
  sunIntensity: number;
  /** 雾色 */
  fogColor: number;
  fogNear: number;
  fogFar: number;
  hemiIntensity: number;
  /** 全屏色罩 rgba 强度(0 隐藏) */
  overlayOpacity: number;
  /** 全屏色罩颜色(CSS rgba 的 rgb 部分) */
  overlayRgb: string;
}

interface PresetSpec {
  from: AtmosphereValues;
  to: AtmosphereValues;
}

export const ATMOSPHERE_PRESETS: Record<AtmospherePreset, PresetSpec> = {
  /** 教学关:日常白天 → 傍晚橙暮 */
  day: {
    from: { sunColor: 0xfff1da, sunIntensity: 2.4, fogColor: 0xc3d3e2, fogNear: 140, fogFar: 460, hemiIntensity: 0.9, overlayOpacity: 0, overlayRgb: '255,120,40' },
    to: { sunColor: 0xff9a5c, sunIntensity: 1.1, fogColor: 0x8a6f66, fogNear: 95, fogFar: 300, hemiIntensity: 0.55, overlayOpacity: 0.22, overlayRgb: '255,120,40' },
  },
  /** 案件二:暴雨铅灰 → 更深雨暮(冷调压暗) */
  storm: {
    from: { sunColor: 0xcfd8dc, sunIntensity: 1.1, fogColor: 0x8b9799, fogNear: 70, fogFar: 300, hemiIntensity: 0.85, overlayOpacity: 0, overlayRgb: '28,38,52' },
    to: { sunColor: 0x9aa7b0, sunIntensity: 0.6, fogColor: 0x5f6a70, fogNear: 50, fogFar: 200, hemiIntensity: 0.5, overlayOpacity: 0.3, overlayRgb: '28,38,52' },
  },
  /** 案件三:黄昏硝烟 → 夜战残照(暖红压暗) */
  war: {
    from: { sunColor: 0xffd2a8, sunIntensity: 1.7, fogColor: 0x7d7568, fogNear: 55, fogFar: 260, hemiIntensity: 0.7, overlayOpacity: 0, overlayRgb: '120,45,18' },
    to: { sunColor: 0xd96a3a, sunIntensity: 0.85, fogColor: 0x4f4740, fogNear: 40, fogFar: 180, hemiIntensity: 0.45, overlayOpacity: 0.28, overlayRgb: '120,45,18' },
  },
};

/** 案件 id → 氛围预设(缺省日常白天)。 */
export function presetForLevel(levelId: string): AtmospherePreset {
  if (levelId === 'stone-arch-emergency') return 'storm';
  if (levelId === 'qiantang-1937') return 'war';
  return 'day';
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const lerpColor = (a: number, b: number, k: number): number => {
  const ar = a >> 16;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = b >> 16;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (Math.round(lerp(ar, br, k)) << 16) | (Math.round(lerp(ag, bg, k)) << 8) | Math.round(lerp(ab, bb, k));
};

/**
 * 计算时限进度 k(0→1)对应的氛围参数。
 * 曲线:0~0.6 走 40% 变化(缓),0.6~1 走余下 60%(加速)。
 */
export function atmosphereValues(preset: AtmospherePreset, k: number): AtmosphereValues {
  const spec = ATMOSPHERE_PRESETS[preset];
  const t = Math.max(0, Math.min(1, k));
  const eased = t <= 0.6 ? (t / 0.6) * 0.4 : 0.4 + ((t - 0.6) / 0.4) * 0.6;
  return {
    sunColor: lerpColor(spec.from.sunColor, spec.to.sunColor, eased),
    sunIntensity: lerp(spec.from.sunIntensity, spec.to.sunIntensity, eased),
    fogColor: lerpColor(spec.from.fogColor, spec.to.fogColor, eased),
    fogNear: lerp(spec.from.fogNear, spec.to.fogNear, eased),
    fogFar: lerp(spec.from.fogFar, spec.to.fogFar, eased),
    hemiIntensity: lerp(spec.from.hemiIntensity, spec.to.hemiIntensity, eased),
    overlayOpacity: lerp(spec.from.overlayOpacity, spec.to.overlayOpacity, eased),
    overlayRgb: spec.from.overlayRgb,
  };
}

/** 紧迫态阈值(剩余秒数低于此值进入最后提示,配合 HUD 计时条 urgent)。 */
export const URGENT_SECONDS = 60;
