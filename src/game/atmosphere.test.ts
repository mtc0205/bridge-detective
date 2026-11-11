import { describe, expect, it } from 'vitest';
import { atmosphereValues, presetForLevel, ATMOSPHERE_PRESETS, URGENT_SECONDS } from './atmosphere';

describe('atmosphereValues 日落倒计时插值(M3)', () => {
  it('三个预设首尾值与各资产初始氛围一致(无跳变)', () => {
    // 教学关(箱梁资产初值)
    const day0 = atmosphereValues('day', 0);
    expect(day0.sunColor).toBe(0xfff1da);
    expect(day0.sunIntensity).toBe(2.4);
    expect(day0.fogNear).toBe(140);
    expect(day0.overlayOpacity).toBe(0);
    // 案件二(石拱资产初值)
    const storm0 = atmosphereValues('storm', 0);
    expect(storm0.fogColor).toBe(0x8b9799);
    expect(storm0.sunIntensity).toBe(1.1);
    // 案件三(钢桁资产初值)
    const war0 = atmosphereValues('war', 0);
    expect(war0.fogColor).toBe(0x7d7568);
    expect(war0.sunIntensity).toBe(1.7);
  });

  it('k=1 收敛到终局值;强度/雾距只降不升,色罩只升不降(压力单调)', () => {
    for (const preset of ['day', 'storm', 'war'] as const) {
      const from = atmosphereValues(preset, 0);
      const to = atmosphereValues(preset, 1);
      expect(to.sunIntensity, preset).toBeLessThan(from.sunIntensity);
      expect(to.hemiIntensity, preset).toBeLessThan(from.hemiIntensity);
      expect(to.fogNear, preset).toBeLessThan(from.fogNear);
      expect(to.fogFar, preset).toBeLessThan(from.fogFar);
      expect(to.overlayOpacity, preset).toBeGreaterThan(from.overlayOpacity);
      // 中途值落在两端之间(线性插值不越界)
      const mid = atmosphereValues(preset, 0.5);
      expect(mid.sunIntensity).toBeGreaterThan(to.sunIntensity);
      expect(mid.sunIntensity).toBeLessThan(from.sunIntensity);
      expect(mid.overlayOpacity).toBeLessThan(to.overlayOpacity);
    }
  });

  it('分段缓急:前 60% 时限只完成 40% 变化', () => {
    const day = atmosphereValues('day', 0.6);
    const from = ATMOSPHERE_PRESETS.day.from;
    const to = ATMOSPHERE_PRESETS.day.to;
    const progressed = (from.sunIntensity - day.sunIntensity) / (from.sunIntensity - to.sunIntensity);
    expect(progressed).toBeCloseTo(0.4, 5);
  });

  it('k 越界被夹取;紧迫阈值 60 秒', () => {
    expect(atmosphereValues('day', -1).overlayOpacity).toBe(0);
    expect(atmosphereValues('day', 2)).toEqual(atmosphereValues('day', 1));
    expect(URGENT_SECONDS).toBe(60);
  });

  it('案件 id → 预设映射(缺省日常白天)', () => {
    expect(presetForLevel('tutorial-viaduct')).toBe('day');
    expect(presetForLevel('stone-arch-emergency')).toBe('storm');
    expect(presetForLevel('qiantang-1937')).toBe('war');
    expect(presetForLevel('anything-else')).toBe('day');
  });
});
