/**
 * 三跨预应力混凝土连续箱梁桥 —— 参数化程序占位模型(M0)。
 *
 * 布局(米):
 * - 桥轴线为 X(西 → 东),横向为 Z,向上为 Y;
 * - 桥面 90m × 12m,顶面 y=9.0;箱梁底宽 6m、梁高 1.9m;
 * - 双柱墩 ×2(x=±15,每墩两根柱 z=±2.6),柱顶板式支座;
 * - 两侧防撞栏杆;两端填土路堤坡道(45→68m 下到地面);
 * - 河流沿 Z 在北侧(z<-5),水面 y=-0.9,挡墙护岸;
 * - 桥下便道 z∈[-2,2](全桥长),供墩柱 / 支座近距离检测。
 *
 * 性能:全场景 <40 个 Mesh、共享少量 MeshStandardMaterial,无逐段细分,
 * 桌面 60fps 富余。M2 换 Lux3D 资产后本文件仅作占位参考。
 */

import * as THREE from 'three';
import type { LevelAsset, LevelAssetFactory } from './levelAsset';
import type { Aabb, SurfaceSampler } from '../player/terrain';
import type { LevelData } from '../game/level';

/** 几何常数(米)。关卡 JSON 的热点坐标以此为准。 */
export const BRIDGE = {
  deckLength: 90,
  deckHalfLength: 45,
  deckWidth: 12,
  deckHalfWidth: 6,
  deckTopY: 9.0,
  girderBottomY: 7.1,
  girderBottomHalfWidth: 3,
  railingZ: 5.55,
  railingTopY: 10.24,
  railingInnerZ: 5.2,
  pierX: [-15, 15],
  columnHalfX: 1.0,
  columnZ: 2.6,
  columnHalfZ: 0.7,
  columnTopY: 6.9,
  bearingHalf: 0.4,
  embankmentRun: 23,
  groundY: 0,
  pathTopY: 0.09,
  bankWallZ: -5.0,
  waterY: -0.9,
} as const;

const G = BRIDGE;

function std(color: number, roughness = 0.9, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** 程序箱梁桥资产。 */
class BoxGirderAsset implements LevelAsset {
  readonly root = new THREE.Group();
  readonly colliders: Aabb[] = [];
  readonly spawn;
  private readonly water: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  private readonly skyTexture: THREE.CanvasTexture;

  /**
   * 多层高度场(米):
   * - 桥面立柱(|x|≤45, |z|≤6)同时有桥面 9m 与桥下地面/便道两层;
   * - 路堤楔块(45<|x|<68, |z|≤6)是实体,只返回坡面高度(侧壁自然成墙);
   * - 北侧 z<-4.7 为河道,无可站立面(另有挡墙碰撞体兜底)。
   */
  readonly surfacesAt: SurfaceSampler = (x, z) => {
    const d = Math.abs(x) - G.deckHalfLength;
    if (Math.abs(z) <= G.deckHalfWidth && d > 0 && d < G.embankmentRun) {
      return [Math.max(G.groundY, G.deckTopY * (1 - d / G.embankmentRun))];
    }
    const heights: number[] = [];
    if (z >= -4.7) {
      heights.push(Math.abs(z) <= 2 && Math.abs(x) <= 52 ? G.pathTopY : G.groundY);
    }
    if (Math.abs(z) <= G.deckHalfWidth && Math.abs(x) <= G.deckHalfLength) {
      heights.push(G.deckTopY);
    }
    return heights;
  };

  constructor(level: LevelData) {
    this.spawn = {
      x: level.spawn.position[0],
      y: level.spawn.position[1],
      z: level.spawn.position[2],
      yawDeg: level.spawn.yawDeg,
    };
    this.skyTexture = BoxGirderAsset.makeSkyTexture();
    this.buildGroundAndWater();
    this.buildDeck();
    this.buildPiers();
    this.buildRailings();
    this.buildEmbankments();
    this.water = this.buildWater();
    this.root.name = 'box-girder-bridge';
  }

  // —————————————————————— 地面 / 便道 / 护岸 ——————————————————————

  private buildGroundAndWater(): void {
    // 南侧大地坪(z ∈ [-5, 205])
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 210), this.track(std(0x6e8f57, 1)));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, G.groundY, 100);
    ground.receiveShadow = true;
    this.root.add(ground);

    // 桥下检修便道(碎石色,略高于地面)
    const path = new THREE.Mesh(new THREE.BoxGeometry(104, G.pathTopY, 4), this.track(std(0x8f8674, 0.98)));
    path.position.set(0, G.pathTopY / 2, 0);
    path.receiveShadow = true;
    this.root.add(path);

    // 河岸挡墙(兼作北侧边界碰撞体)
    const wallMat = this.track(std(0x9b9484, 0.95));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(600, 2, 0.6), wallMat);
    wall.position.set(0, -0.4, G.bankWallZ);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.root.add(wall);
    this.colliders.push({ minX: -140, maxX: 140, minY: -1.5, maxY: 0.8, minZ: -5.3, maxZ: -4.7 });
  }

  private buildWater(): THREE.Mesh {
    const waterMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x3d6b8a,
        roughness: 0.28,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      }),
    );
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 195), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, G.waterY, -102.2); // 北至远处,南抵挡墙
    water.receiveShadow = true;
    this.root.add(water);
    return water;
  }

  // —————————————————————— 桥面系 ——————————————————————

  private buildDeck(): void {
    // 箱梁梯形断面(底宽 6 → 顶宽 12),沿桥轴向挤出 90m
    const profile = new THREE.Shape();
    profile.moveTo(-G.deckHalfWidth, G.deckTopY);
    profile.lineTo(G.deckHalfWidth, G.deckTopY);
    profile.lineTo(G.girderBottomHalfWidth, G.girderBottomY);
    profile.lineTo(-G.girderBottomHalfWidth, G.girderBottomY);
    profile.closePath();
    const girderGeo = new THREE.ExtrudeGeometry(profile, { depth: G.deckLength, bevelEnabled: false });
    girderGeo.rotateY(Math.PI / 2); // 截面 XY → ZY,挤出方向 +Z → +X
    girderGeo.translate(-G.deckHalfLength, 0, 0);
    const girder = new THREE.Mesh(girderGeo, this.track(std(0xb7bcc2, 0.92)));
    girder.castShadow = true;
    girder.receiveShadow = true;
    this.root.add(girder);

    // 沥青铺装(略窄,露出混凝土翼缘边缘)
    const asphalt = new THREE.Mesh(
      new THREE.BoxGeometry(G.deckLength, 0.04, 11.7),
      this.track(std(0x3b3e44, 0.96)),
    );
    asphalt.position.set(0, 8.98, 0);
    asphalt.receiveShadow = true;
    this.root.add(asphalt);

    // 标线:两侧白色边缘线 + 中央黄色虚线(段数受控,共 12 个小面)
    const lineMat = this.track(std(0xe8eaec, 0.8));
    const dashMat = this.track(std(0xd9b94a, 0.8));
    for (const z of [-4.6, 4.6]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(89.4, 0.012, 0.15), lineMat);
      edge.position.set(0, 9.012, z);
      this.root.add(edge);
    }
    for (let x = -36; x <= 36; x += 8) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.012, 0.18), dashMat);
      dash.position.set(x, 9.012, 0);
      this.root.add(dash);
    }

    // 桥台处伸缩缝(深色缝条,对应伸缩缝热点)
    const jointMat = this.track(std(0x23262b, 0.85));
    for (const x of [-44.7, 44.7]) {
      const joint = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 11.6), jointMat);
      joint.position.set(x, 9.014, 0);
      this.root.add(joint);
    }

    // 排水孔(深色小方块;一处对应堵塞热点,另两处装饰)
    const drainMat = this.track(std(0x2c3036, 0.9));
    for (const x of [-20, 5, 28]) {
      const drain = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.3), drainMat);
      drain.position.set(x, 9.01, -4.75);
      this.root.add(drain);
    }
  }

  // —————————————————————— 下部结构 ——————————————————————

  private buildPiers(): void {
    const columnMat = this.track(std(0xa6abb2, 0.92));
    const bearingMat = this.track(std(0x35393f, 0.55, 0.3));
    for (const px of G.pierX) {
      for (const cz of [-G.columnZ, G.columnZ]) {
        // 双柱墩柱
        const column = new THREE.Mesh(
          new THREE.BoxGeometry(G.columnHalfX * 2, G.columnTopY, G.columnHalfZ * 2),
          columnMat,
        );
        column.position.set(px, G.columnTopY / 2, cz);
        column.castShadow = true;
        column.receiveShadow = true;
        this.root.add(column);
        this.colliders.push({
          minX: px - G.columnHalfX,
          maxX: px + G.columnHalfX,
          minY: 0,
          maxY: G.columnTopY,
          minZ: cz - G.columnHalfZ,
          maxZ: cz + G.columnHalfZ,
        });
        // 柱顶板式支座(支座脱空热点所在)
        const bearing = new THREE.Mesh(
          new THREE.BoxGeometry(G.bearingHalf * 2, 0.2, G.bearingHalf * 2),
          bearingMat,
        );
        bearing.position.set(px, G.columnTopY + 0.1, cz);
        bearing.castShadow = true;
        this.root.add(bearing);
      }
    }
  }

  // —————————————————————— 附属设施 ——————————————————————

  private buildRailings(): void {
    const railMat = this.track(std(0xc7ccd2, 0.9));
    const capMat = this.track(std(0x9aa2ab, 0.85));
    for (const z of [-G.railingZ, G.railingZ]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(G.deckLength, 1.1, 0.7),
        railMat,
      );
      wall.position.set(0, 9.55, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.root.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(G.deckLength, 0.14, 0.86), capMat);
      cap.position.set(0, 10.17, z);
      cap.castShadow = true;
      this.root.add(cap);
      this.colliders.push({
        minX: -G.deckHalfLength,
        maxX: G.deckHalfLength,
        minY: G.deckTopY,
        maxY: G.railingTopY,
        minZ: z - 0.35,
        maxZ: z + 0.35,
      });
    }
  }

  /** 两端填土路堤楔块(坡道),顶接桥面、 toe 落地面。 */
  private buildEmbankments(): void {
    const earthMat = this.track(std(0x7c9663, 1));
    const makeWedge = (dir: 1 | -1): THREE.Mesh => {
      const toe = dir * (G.deckHalfLength + G.embankmentRun);
      const face = dir * G.deckHalfLength;
      const shape = new THREE.Shape();
      shape.moveTo(face, G.deckTopY);
      shape.lineTo(toe, G.groundY);
      shape.lineTo(face, G.groundY);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: G.deckWidth, bevelEnabled: false });
      geo.translate(0, 0, -G.deckHalfWidth);
      const mesh = new THREE.Mesh(geo, earthMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    this.root.add(makeWedge(1), makeWedge(-1));
  }

  // —————————————————————— 天空 / 光照 ——————————————————————

  /** 渐变天空:2:1 canvas 竖直渐变,按 equirect 作为 scene.background。 */
  private static makeSkyTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0.0, '#5c9dd6'); // 天顶
      grad.addColorStop(0.42, '#a9cbe8'); // 中天
      grad.addColorStop(0.52, '#e3edf5'); // 地平线亮带
      grad.addColorStop(0.62, '#c3cfd8'); // 地面雾霾
      grad.addColorStop(1.0, '#aab7c0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  decorateScene(scene: THREE.Scene): void {
    scene.background = this.skyTexture;
    scene.fog = new THREE.Fog(0xc3d3e2, 140, 460);

    // 半球光:天空冷调 / 地面暖绿
    const hemi = new THREE.HemisphereLight(0xbfd8ef, 0x8b9678, 0.9);
    scene.add(hemi);

    // 平行光(太阳)带阴影,覆盖全桥
    const sun = new THREE.DirectionalLight(0xfff1da, 2.4);
    sun.position.set(70, 95, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -100;
    cam.right = 100;
    cam.top = 90;
    cam.bottom = -60;
    cam.near = 10;
    cam.far = 280;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
  }

  update(elapsedSec: number): void {
    // 水面缓慢起伏(幅度 2cm,视觉活度,开销可忽略)
    this.water.position.y = G.waterY + Math.sin(elapsedSec * 0.7) * 0.02;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    for (const m of this.materials) m.dispose();
    this.skyTexture.dispose();
    this.root.clear();
  }

  /** 登记材质便于统一释放。 */
  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }
}

/** 资产工厂:教学关程序桥。M2 在 main.ts 换 Lux3D 工厂。 */
export const createBoxGirderAsset: LevelAssetFactory = (level) => new BoxGirderAsset(level);
