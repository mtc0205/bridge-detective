/**
 * 第一人称控制器:WASD 移动 + PointerLock 鼠标视角 + 重力贴地。
 *
 * - 碰撞:多层高度场 + AABB 墙(见 `src/player/terrain.ts`),
 *   支持「桥面 ⇄ 路堤坡道 ⇄ 桥下便道」的完整动线;
 * - 相机高度(眼高)1.65m;
 * - Esc 释放指针由浏览器 PointerLock 机制处理,`game.ts` 监听锁变化进入暂停。
 */

import * as THREE from 'three';
import type { LevelAsset } from '../bridge/levelAsset';
import { applyVertical, pickSurface, resolveHorizontalMove } from './terrain';

export const EYE_HEIGHT = 1.65;

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.2;
/** 水平速度指数趋近系数(越大起步/停步越干脆)。 */
const ACCEL = 11;
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_LIMIT = 1.45; // ≈83°,可仰视支座
/** 场地边界(双保险,正常情况下被挡墙/碰撞体拦住)。 */
const BOUNDS = { minX: -110, maxX: 110, minZ: -4.5, maxZ: 150 };

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly asset: LevelAsset;
  private readonly keys = new Set<string>();

  private posX = 0;
  private posZ = 0;
  private feetY = 0;
  private velX = 0;
  private velZ = 0;
  private velY = 0;
  private yaw = 0;
  private pitch = 0;
  private enabledState = false;

  constructor(canvas: HTMLCanvasElement, asset: LevelAsset) {
    this.canvas = canvas;
    this.asset = asset;
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.08, 700);
    this.camera.rotation.order = 'YXZ';

    const sp = asset.spawn;
    this.posX = sp.x;
    this.posZ = sp.z;
    this.feetY = sp.y;
    this.yaw = THREE.MathUtils.degToRad(sp.yawDeg);
    this.applyCamera();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.clearKeys);
  }

  /** 是否接受输入(弹窗打开 / 暂停 / 结算时关闭)。 */
  get enabled(): boolean {
    return this.enabledState;
  }

  set enabled(value: boolean) {
    this.enabledState = value;
    if (!value) {
      this.clearKeys();
      this.velX = 0;
      this.velZ = 0;
    }
  }

  /** 每帧驱动(仅游玩状态调用)。 */
  update(dt: number): void {
    if (!this.enabledState) return;

    // —— 输入 → 期望水平速度(相对朝向) ——
    const forward =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;

    let wishX = 0;
    let wishZ = 0;
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // forward = (-sin, -cos),right = (cos, -sin)
      let mx = -sin * forward + cos * strafe;
      let mz = -cos * forward - sin * strafe;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      wishX = mx * speed;
      wishZ = mz * speed;
    }

    // —— 加速度平滑(指数趋近) ——
    const k = 1 - Math.exp(-ACCEL * dt);
    this.velX += (wishX - this.velX) * k;
    this.velZ += (wishZ - this.velZ) * k;

    // —— 水平碰撞(滑墙)+ 场地边界 ——
    const moved = resolveHorizontalMove(
      this.asset.colliders,
      this.asset.surfacesAt,
      { x: this.posX, z: this.posZ },
      { x: this.velX * dt, z: this.velZ * dt },
      this.feetY,
    );
    this.posX = THREE.MathUtils.clamp(moved.x, BOUNDS.minX, BOUNDS.maxX);
    this.posZ = THREE.MathUtils.clamp(moved.z, BOUNDS.minZ, BOUNDS.maxZ);

    // —— 竖直:贴地 / 下落 ——
    const ground = pickSurface(this.asset.surfacesAt(this.posX, this.posZ), this.feetY);
    const v = applyVertical(this.feetY, this.velY, dt, ground);
    this.feetY = v.feetY;
    this.velY = v.vy;

    this.applyCamera();
  }

  /** 视口尺寸变化。 */
  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.clearKeys);
  }

  private applyCamera(): void {
    this.camera.position.set(this.posX, this.feetY + EYE_HEIGHT, this.posZ);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.enabledState) this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private clearKeys = (): void => {
    this.keys.clear();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.enabledState || document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
  };
}
