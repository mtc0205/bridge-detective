/**
 * 简化地形碰撞(纯逻辑,可单元测试)。
 *
 * 模型:
 * - 「地面」用高度场表达:`surfacesAt(x, z)` 返回该立柱上所有可站立面高度
 *   (支持多层,如桥面 9m + 桥下地面 0m 同一 (x,z) 列);
 * - 「墙」用 AABB 表达(栏杆、墩柱、挡墙等薄壁构件,高度场无法表达)。
 *
 * 规则:
 * - 玩家半径 PLAYER_RADIUS 的水平圆盘 + 高 PLAYER_HEIGHT 的竖直胶囊近似;
 * - 站立面选取:取「不高于脚底 + STEP_UP」的最高面 —— 低于当前脚底的面落到下一层,
 *   高于 STEP_UP 的面视为不可进入(坡道侧壁自然成墙);
 * - 下落:脚底与所选面落差超过 STEP_SNAP_DOWN 时不吸附,进入重力下落。
 */

/** 玩家碰撞参数(米)。 */
export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.8;
/** 台阶/坡道最大自动踏上高度。 */
export const STEP_UP = 0.55;
/** 下坡自动贴地最大落差(超过则视为走出边缘,进入下落)。 */
export const STEP_SNAP_DOWN = 0.75;
/** 游戏手感重力(比真实重力略大,落地更干脆)。 */
export const GRAVITY = 22;

/** 阻挡体 AABB。 */
export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** (x, z) 立柱上所有可站立面高度,顺序不限。 */
export type SurfaceSampler = (x: number, z: number) => number[];

/**
 * 选出玩家应站立的面:不高于 feetY + STEP_UP 的最高面。
 * 返回 null 表示该位置对玩家不可进入(全是陡壁,例如路堤侧壁)。
 */
export function pickSurface(heights: readonly number[], feetY: number): number | null {
  let best: number | null = null;
  for (const h of heights) {
    if (h <= feetY + STEP_UP && (best === null || h > best)) {
      best = h;
    }
  }
  return best;
}

/** 水平移动是否被任一 AABB 阻挡(考虑玩家半径与身体高度)。 */
export function collidesWalls(colliders: readonly Aabb[], x: number, z: number, feetY: number): boolean {
  for (const c of colliders) {
    if (
      x > c.minX - PLAYER_RADIUS &&
      x < c.maxX + PLAYER_RADIUS &&
      z > c.minZ - PLAYER_RADIUS &&
      z < c.maxZ + PLAYER_RADIUS &&
      c.maxY > feetY + STEP_UP &&
      c.minY < feetY + PLAYER_HEIGHT
    ) {
      return true;
    }
  }
  return false;
}

export interface Vec2 {
  x: number;
  z: number;
}

/**
 * 水平移动解算:先 X 后 Z 轴分别尝试,被挡的轴保持原位(滑墙)。
 * 目标位置若落在不可站立立柱(如路堤内部)同样视为阻挡。
 */
export function resolveHorizontalMove(
  colliders: readonly Aabb[],
  surfacesAt: SurfaceSampler,
  from: Vec2,
  delta: Vec2,
  feetY: number,
): Vec2 {
  const passable = (x: number, z: number): boolean => {
    if (collidesWalls(colliders, x, z, feetY)) return false;
    return pickSurface(surfacesAt(x, z), feetY) !== null;
  };
  let { x, z } = from;
  if (delta.x !== 0 && passable(x + delta.x, z)) {
    x += delta.x;
  }
  if (delta.z !== 0 && passable(x, z + delta.z)) {
    z += delta.z;
  }
  return { x, z };
}

export interface VerticalState {
  feetY: number;
  vy: number;
  grounded: boolean;
}

/**
 * 竖直解算:贴地 / 走下坡吸附 / 走出台阶下落。
 * groundHeight 为 pickSurface 的结果,可能为 null(不可站立立柱,保持下落)。
 */
export function applyVertical(feetY: number, vy: number, dt: number, groundHeight: number | null): VerticalState {
  if (groundHeight !== null) {
    const gap = feetY - groundHeight;
    // 贴地吸附:站在面上或缓步下行
    if (gap <= STEP_SNAP_DOWN && vy <= 0.001) {
      return { feetY: groundHeight, vy: 0, grounded: true };
    }
    // 上坡被台阶抬升(pickSurface 允许 +STEP_UP 内的抬升)
    if (gap < 0) {
      return { feetY: groundHeight, vy: 0, grounded: true };
    }
  }
  // 自由下落
  const nextVy = vy - GRAVITY * dt;
  const nextFeetY = feetY + nextVy * dt;
  if (groundHeight !== null && nextFeetY <= groundHeight) {
    return { feetY: groundHeight, vy: 0, grounded: true };
  }
  return { feetY: nextFeetY, vy: nextVy, grounded: false };
}
