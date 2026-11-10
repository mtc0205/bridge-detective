/**
 * 关卡资产统一接口。
 *
 * M0:由 `src/bridge/boxGirder.ts` 的参数化程序桥实现;
 * M2:Lux3D 账号解锁后,替换为 glb/gltf(GLTFLoader)或 3DGS Viewer 方案的实现,
 * 玩法层(控制器 / 热点 / HUD)只依赖本接口,做到资产即插即换。
 */

import type * as THREE from 'three';
import type { Aabb, SurfaceSampler } from '../player/terrain';
import type { LevelData } from '../game/level';

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  /** 朝向角(度):0 朝 -Z,-90 朝 +X */
  yawDeg: number;
}

export interface LevelAsset {
  /** 场景内容根节点(桥体、地面、水面、便道等) */
  readonly root: THREE.Object3D;

  /** 阻挡玩家水平移动的 AABB(栏杆 / 墩柱 / 挡墙等) */
  readonly colliders: readonly Aabb[];

  /** (x, z) 立柱上所有可站立面高度(支持多层:桥面 + 桥下地面) */
  readonly surfacesAt: SurfaceSampler;

  /** 玩家出生点 */
  readonly spawn: SpawnPoint;

  /** 场景装扮:渐变天空、雾、DirectionalLight + HemisphereLight 光照 */
  decorateScene(scene: THREE.Scene): void;

  /** 每帧更新(水面微动等) */
  update(elapsedSec: number, dt: number): void;

  /** 释放 GPU 资源 */
  dispose(): void;
}

/** 资产工厂:按关卡数据构建资产。M2 时在入口(main.ts)换成 Lux3D 工厂即可。 */
export type LevelAssetFactory = (level: LevelData) => LevelAsset;
