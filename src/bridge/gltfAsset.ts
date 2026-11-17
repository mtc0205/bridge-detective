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

/** 诊断探针(非生产依赖):热切换状态挂在 window 上便于实机排查。 */
function probe(state: string, detail?: unknown): void {
  const w = globalThis as unknown as Record<string, unknown>;
  w.__lux3d = { state, detail: detail === undefined ? null : String(detail) };
}

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
 *
 * Lux3D 生成的模型自带归一化坐标/尺度(且主轴可能沿 Z),与程序骨架
 * (桥轴 = X,与关卡 JSON 热点坐标系绑定)不一致 —— 交换前做一次
 * 「归一化摆放」:横向主轴若沿 Z 先绕 Y 转 90° 对齐桥轴,再等比缩放
 * 适配程序骨架的 X 跨度,最后以程序骨架包围盒中心对齐。碰撞与热点
 * 始终来自程序资产,视觉近似即可,不追求逐构件重合。
 */
export function withLux3dVisuals(fallback: LevelAssetFactory): LevelAssetFactory {
  return (level) => {
    const base: LevelAsset = fallback(level);
    const glb = level.asset?.glb;
    if (!glb) return base;
    getLoader().load(
      glb,
      (gltf) => {
        probe('parsed');
        // 程序化视觉的原始包围盒 = 摆放基准(交换前先量好)
        const target = new THREE.Box3();
        for (const child of base.root.children) target.expandByObject(child);
        if (target.isEmpty()) { probe('no-target-bounds'); return; }

        const scene = gltf.scene;
        const source = new THREE.Box3().setFromObject(scene);
        if (source.isEmpty()) { probe('no-source-bounds'); return; }
        const srcSize = source.getSize(new THREE.Vector3());
        const dstSize = target.getSize(new THREE.Vector3());

        // 横向主轴若明显沿 Z(生成模型的常见朝向),绕 Y 旋转 90° 对齐桥轴 X
        if (srcSize.z > srcSize.x * 1.25) {
          scene.rotation.y = Math.PI / 2;
          scene.updateMatrixWorld(true);
          source.setFromObject(scene);
          srcSize.copy(source.getSize(new THREE.Vector3()));
        }

        // 等比缩放:桥轴跨度对齐;再以两包围盒中心重合摆放
        const scale = dstSize.x > 0 && srcSize.x > 1e-6 ? dstSize.x / srcSize.x : 1;
        scene.scale.multiplyScalar(scale);
        scene.updateMatrixWorld(true);
        const fitted = new THREE.Box3().setFromObject(scene);
        const srcCenter = fitted.getCenter(new THREE.Vector3());
        const dstCenter = target.getCenter(new THREE.Vector3());
        scene.position.add(dstCenter.sub(srcCenter));

        // 保留 root 变换锚点,只换内容;旧程序化网格立即释放几何(材质由程序资产统一管理),
        // glb 内容后续交由 base.dispose 遍历释放
        for (const child of [...base.root.children]) {
          base.root.remove(child);
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        }
        base.root.add(scene);
        probe('swapped', `scale=${scale.toFixed(3)} srcX=${srcSize.x.toFixed(1)} dstX=${dstSize.x.toFixed(1)}`);
      },
      undefined,
      (err) => probe('error', err), // 无 glb / 加载失败:静默保持程序化兜底
    );
    return base;
  };
}
