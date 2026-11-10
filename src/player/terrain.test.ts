import { describe, expect, it } from 'vitest';
import {
  applyVertical,
  pickSurface,
  resolveHorizontalMove,
  type Aabb,
  type SurfaceSampler,
} from './terrain';

/**
 * 迷你桥型高度场,与 boxGirder.ts 同构:
 * - 桥面 |x|≤45 且 |z|≤6 → 9m(其下同列还有地面 0m)
 * - 地面 z≥-4.7 → 0m(便道 |z|≤2 加高 0.09m)
 * - 路堤 45<|x|<68 且 |z|≤6 → 线性坡面 9→0(实体,无下层)
 */
const surfacesAt: SurfaceSampler = (x, z) => {
  const heights: number[] = [];
  const d = Math.abs(x) - 45;
  if (Math.abs(z) <= 6 && d > 0 && d < 23) {
    return [Math.max(0, 9 * (1 - d / 23))];
  }
  if (z >= -4.7) heights.push(Math.abs(z) <= 2 && Math.abs(x) <= 52 ? 0.09 : 0);
  if (Math.abs(z) <= 6 && Math.abs(x) <= 45) heights.push(9);
  return heights;
};

/** 防撞栏杆(x 向长墙,y 9~10.1)。 */
const railing: Aabb = { minX: -45, maxX: 45, minY: 9, maxY: 10.1, minZ: 5.2, maxZ: 5.9 };
/** 墩柱(y 0~6.9)。 */
const column: Aabb = { minX: 14, maxX: 16, minY: 0, maxY: 6.9, minZ: 1.9, maxZ: 3.3 };

describe('pickSurface 多层高度场', () => {
  it('桥上玩家取桥面 9m,桥下玩家取地面 0m(同一立柱)', () => {
    expect(pickSurface(surfacesAt(0, 0), 9)).toBe(9);
    expect(pickSurface(surfacesAt(0, 0), 0)).toBe(0.09); // 便道面
    expect(pickSurface(surfacesAt(0, 5.9), 0)).toBe(0); // 桥下非便道
  });

  it('下落途中的玩家仍抓上一次所在层(9m 面高于脚底 8m?不,8m<9 不可再上)', () => {
    // 脚底 8m 下落中:9 > 8+0.55 不可站立 → 只能落到地面
    expect(pickSurface(surfacesAt(0, 0), 8)).toBe(0.09);
  });

  it('路堤实体柱只返回坡面,无地面层', () => {
    expect(surfacesAt(50, 0)).toHaveLength(1);
    expect(surfacesAt(50, 0)[0]).toBeCloseTo(9 * (1 - 5 / 23), 5);
  });
});

describe('resolveHorizontalMove 滑墙移动', () => {
  it('桥面上撞南侧栏杆:Z 轴被挡,X 轴仍可滑行', () => {
    // 真实帧步长 ≤ 速度×dt 上限 ≈ 0.36m,小于墙厚;这里用 0.4m 步长贴墙
    const next = resolveHorizontalMove([railing], surfacesAt, { x: 0, z: 4.5 }, { x: 2, z: 0.4 }, 9);
    // z 目标 4.9 已进入栏杆膨胀区(内沿 5.2 - 半径 0.35 = 4.85)
    expect(next.z).toBeCloseTo(4.5);
    expect(next.x).toBeCloseTo(2);
  });

  it('桥下玩家不受栏杆影响(栏杆在其头顶上方)', () => {
    const next = resolveHorizontalMove([railing], surfacesAt, { x: 0, z: 4.5 }, { x: 0, z: 2 }, 0);
    expect(next.z).toBeCloseTo(6.5);
  });

  it('桥下玩家撞墩柱被挡', () => {
    const next = resolveHorizontalMove([column], surfacesAt, { x: 15, z: 1.2 }, { x: 0, z: 2 }, 0);
    // 目标 z=3.2 位于柱内(柱内沿 1.9 - 0.35 = 1.55)
    expect(next.z).toBeCloseTo(1.2);
  });

  it('地面玩家无法横穿路堤侧壁(x=50 处坡高约 7m)', () => {
    const next = resolveHorizontalMove([], surfacesAt, { x: 50, z: 10 }, { x: 0, z: -6 }, 0);
    expect(next.z).toBeCloseTo(10); // 越过 z=6 进入路堤立柱 → 无可站立面 → 阻挡
  });

  it('路堤上的玩家沿坡面正常行走', () => {
    const next = resolveHorizontalMove([], surfacesAt, { x: 50, z: 0 }, { x: 2, z: 0 }, 9 * (1 - 5 / 23));
    expect(next.x).toBeCloseTo(52);
  });
});

describe('applyVertical 重力贴地', () => {
  it('站地面保持贴地', () => {
    const s = applyVertical(0, 0, 1 / 60, 0);
    expect(s).toEqual({ feetY: 0, vy: 0, grounded: true });
  });

  it('走出桥面边缘进入自由下落', () => {
    // 脚底 9m,所选面 0.09m(落差远超吸附阈值)→ 自由下落
    const s = applyVertical(9, 0, 1 / 60, 0.09);
    expect(s.grounded).toBe(false);
    expect(s.vy).toBeLessThan(0);
  });

  it('下落至地面即着陆(速度清零)', () => {
    // 速度 -8m/s、0.5s 内会穿地 → 应夹到地面
    const s = applyVertical(0.5, -8, 0.2, 0);
    expect(s.feetY).toBe(0);
    expect(s.vy).toBe(0);
    expect(s.grounded).toBe(true);
  });

  it('下坡缓降自动吸附(落差 0.3m)', () => {
    const s = applyVertical(0.3, 0, 1 / 60, 0);
    expect(s.grounded).toBe(true);
    expect(s.feetY).toBe(0);
  });

  it('地面对 null(不可站立)时保持下落', () => {
    const s = applyVertical(5, -1, 1 / 60, null);
    expect(s.grounded).toBe(false);
    expect(s.feetY).toBeLessThan(5);
  });
});
