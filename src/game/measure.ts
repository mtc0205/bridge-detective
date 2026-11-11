/**
 * 量测参考尺(裂缝宽度卡尺,M3 加分项):纯逻辑阈值判定,可单元测试。
 *
 * 近景描述里带实测数值(mm)的缺陷(以裂缝为主)提供可选「量测参考」:
 * 玩家拖动卡尺对准描述中的缝宽读数,工具按 JTG/T H21-2011 简化口径
 * 给出登记/判级建议。这是决策辅助而非答案——判级仍由玩家提交。
 */

/** 登记阈值:≥0.2mm 需登记(JTG/T H21-2011 简化)。 */
export const CRACK_REGISTER_MM = 0.2;
/** 重级阈值:≥0.3mm 或贯穿分布判「重」。 */
export const CRACK_SEVERE_MM = 0.3;

/** 量程(米字尺显示范围)。 */
export const MEASURE_MIN_MM = 0.05;
export const MEASURE_MAX_MM = 0.6;

export type WidthBucket = 'below' | 'register' | 'severe';

/** 实测缝宽 → 规范口径分档。 */
export function widthBucket(mm: number): WidthBucket {
  if (mm < CRACK_REGISTER_MM) return 'below';
  if (mm < CRACK_SEVERE_MM) return 'register';
  return 'severe';
}

/** 分档建议文案(弹窗内展示;含明确阈值数字,教学口径)。 */
export function bucketAdvice(bucket: WidthBucket): string {
  switch (bucket) {
    case 'below':
      return `缝宽 <${CRACK_REGISTER_MM}mm:未达登记阈值,可不标记(不确定就不标,避免误报)。`;
    case 'register':
      return `缝宽 ≥${CRACK_REGISTER_MM}mm:已达登记阈值,需登记;结合分布形态判「轻 / 中」。`;
    case 'severe':
      return `缝宽 ≥${CRACK_SEVERE_MM}mm:受力 / 贯穿裂缝按规范建议判「重」。`;
  }
}

/** 近景描述是否包含量测数值(mm)——决定是否提供量测参考(数据驱动,不泄答案)。 */
export function descriptionMeasurable(description: string): boolean {
  return /\d(\.\d+)?\s*mm/i.test(description);
}
