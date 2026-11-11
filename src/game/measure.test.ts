import { describe, expect, it } from 'vitest';
import { bucketAdvice, descriptionMeasurable, widthBucket } from './measure';

describe('量测参考尺阈值(M3)', () => {
  it('0.2 / 0.3 双阈值分档与 BRIEF 判定口径一致', () => {
    expect(widthBucket(0.05)).toBe('below');
    expect(widthBucket(0.19)).toBe('below');
    expect(widthBucket(0.2)).toBe('register');
    expect(widthBucket(0.29)).toBe('register');
    expect(widthBucket(0.3)).toBe('severe');
    expect(widthBucket(0.4)).toBe('severe');
  });

  it('分档建议文案含阈值数字(教学可查)', () => {
    expect(bucketAdvice('below')).toContain('0.2');
    expect(bucketAdvice('register')).toContain('0.2');
    expect(bucketAdvice('severe')).toContain('0.3');
    expect(bucketAdvice('severe')).toContain('重');
  });

  it('近景描述含 mm 读数才提供量测(数据驱动,不泄答案)', () => {
    expect(descriptionMeasurable('缝宽约 0.25mm,延伸约 40cm')).toBe(true);
    expect(descriptionMeasurable('缝宽估测 0.4 mm 伴渗水')).toBe(true);
    expect(descriptionMeasurable('支座与梁底间可见约 5mm 脱空缝隙')).toBe(true);
    expect(descriptionMeasurable('锤击有空鼓声,钢筋锈蚀扩展')).toBe(false);
    expect(descriptionMeasurable('栏杆受车辆刮擦成片剥落约 20cm×15cm')).toBe(false);
  });
});
