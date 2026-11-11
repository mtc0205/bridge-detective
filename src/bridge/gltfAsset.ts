/**
 * Lux3D glb 视觉覆盖工厂(M2 占位分支)。
 *
 * 策略:玩法常量(碰撞 AABB / 多层高度场 / 出生点 / 检测动线)始终来自程序化资产
 * ——它们与关卡 JSON 的热点坐标系绑定,不能跟着美术资产漂移;
 * 关卡 JSON 写 `asset: { glb: "/assets/levels/xxx.glb" }` 后,Lux3D 生成的
 * glb(与程序骨架同一坐标系摆放)异步加载成功即替换视觉子树,失败静默保持程序化兜底。
 *
 * 工厂签名保持 LevelAssetFactory(同步),glb 加载为渐进增强:
 * 加载完成前玩家看到的就是程序桥,完成瞬间热切换,无需加载屏。
 * M2 真实接入时若需 Draco/meshopt 解码器,在 loader 上配置即可(见 BRIEF 技术架构)。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelAsset, LevelAssetFactory } from './levelAsset';

/** 缓存的 loader(进程内复用)。 */
let loader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

/**
 * 包装一个程序化工厂:level.asset.glb 存在且加载成功时,
 * 用 glb 场景替换 base.root 的视觉内容(碰撞 / 出生点 / surfacesAt 不变)。
 */
export function withLux3dVisuals(fallback: LevelAssetFactory): LevelAssetFactory {
  return (level) => {
    const base: LevelAsset = fallback(level);
    const glb = level.asset?.glb;
    if (!glb) return base;
    getLoader().load(
      glb,
      (gltf) => {
        // 保留 root 变换锚点,只换内容;旧程序化网格立即释放几何(材质由程序资产统一管理),
        // glb 内容后续交由 base.dispose 遍历释放
        for (const child of [...base.root.children]) {
          base.root.remove(child);
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        }
        base.root.add(gltf.scene);
      },
      undefined,
      () => undefined, // 无 glb / 加载失败:静默保持程序化兜底
    );
    return base;
  };
}
