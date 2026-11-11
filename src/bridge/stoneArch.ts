/**
 * 山村石拱桥 —— 参数化程序占位模型(案件二,M2)。
 *
 * 布局(米,坐标系与 boxGirder 一致:桥轴 X 西→东,北 = -Z,上 = Y):
 * - 单孔实腹式砌石拱桥:净跨 15m(x ±7.5),起拱线 y=1.8,拱顶内弧 y=4.35,
 *   拱圈厚 0.45,13 块楔形拱石拼成(分块端面即立面上可见的砌缝);
 * - 桥面(村道同高 y=5.5)x ∈ ±12.6,宽 4.5m(z ±2.25),石砌护栏;
 * - 桥台 ×2(x ±(7.5..12.6))落于河谷;河谷为南北向条带(x ±7.3),
 *   暴雨浑水 y=-0.4,北侧宽河面 + 桥下过水;
 * - 检测动线:桥面(护栏)→ 东侧坡道下到河滩便道(y=0.4,z ∈ [-4.3,-2.45])
 *   → 沿便道从东往西近观拱圈立面/桥台/护坡(热点全在北立面)→ 西坡道返回;
 * - 氛围:暴雨后 24 小时——铅灰天空、近雾、浑水、阴沉光照。
 *
 * 性能:全场景 ~90 个 Mesh、共享少量材质,M2 换 Lux3D 资产后本文件作占位参考。
 */

import * as THREE from 'three';
import type { LevelAsset, LevelAssetFactory } from './levelAsset';
import type { Aabb, SurfaceSampler } from '../player/terrain';
import type { LevelData } from '../game/level';

/** 几何常数(米)。关卡 JSON 的热点坐标以此为准。 */
export const ARCH = {
  /** 拱圈内弧(腹面):yI(x) = springY + rise * (1 - (x/halfSpan)²) */
  halfSpan: 7.5,
  springY: 1.8,
  rise: 2.55, // 拱顶内弧 4.35
  ringThickness: 0.45,
  ringBlocks: 13,
  deckHalfX: 12.6,
  deckHalfZ: 2.25,
  deckY: 5.5,
  parapetZ: 2.05,
  parapetTopY: 6.35,
  /** 河滩便道 */
  pathZ: [-4.3, -2.45] as const,
  pathY: 0.4,
  rampInnerX: 22,
  rampOuterX: 30,
  /** 河谷缺口与护岸 */
  notchHalfX: 7.3,
  notchSouthZ: 6.5,
  waterY: -0.4,
} as const;

const A = ARCH;

/** 拱圈内弧高度。 */
export function archIntradosY(x: number): number {
  return A.springY + A.rise * (1 - (x / A.halfSpan) ** 2);
}

function std(color: number, roughness = 0.95, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** 程序石拱桥资产。 */
class StoneArchAsset implements LevelAsset {
  readonly root = new THREE.Group();
  readonly colliders: Aabb[] = [];
  readonly spawn;
  private readonly water: THREE.Mesh[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly skyTexture: THREE.CanvasTexture;

  readonly surfacesAt: SurfaceSampler = (x, z) => {
    // 桥面(与两台背后村道同高连续)
    if (Math.abs(z) <= A.deckHalfZ && Math.abs(x) <= A.deckHalfX) return [A.deckY];
    // 河滩便道条带(两端坡道线性爬升回村道)
    if (z >= A.pathZ[0] && z <= A.pathZ[1] && Math.abs(x) <= A.rampOuterX) {
      const ax = Math.abs(x);
      if (ax <= A.rampInnerX) return [A.pathY];
      return [Math.min(A.deckY, A.pathY + ((ax - A.rampInnerX) / (A.rampOuterX - A.rampInnerX)) * (A.deckY - A.pathY))];
    }
    // 村地坪 / 南岸(河谷缺口除外)
    if (z > A.pathZ[1]) {
      if (Math.abs(x) < A.notchHalfX && z < A.notchSouthZ) return []; // 桥下过水缺口
      return [A.deckY];
    }
    // 北侧:|x| ≥ 缺口半宽是岸边高地(视觉),被便道北缘挡墙拦住不可达
    if (z < A.pathZ[0] && Math.abs(x) >= A.notchHalfX) return [A.deckY];
    return [];
  };

  constructor(level: LevelData) {
    this.spawn = {
      x: level.spawn.position[0],
      y: level.spawn.position[1],
      z: level.spawn.position[2],
      yawDeg: level.spawn.yawDeg,
    };
    this.skyTexture = StoneArchAsset.makeSkyTexture();
    this.buildVillage();
    this.buildPathAndRamps();
    this.buildAbutments();
    this.buildArchRing();
    this.buildSpandrels();
    this.buildDeckAndParapets();
    this.buildWater();
    this.buildTrees();
    this.root.name = 'stone-arch-bridge';
  }

  // —————————————————————— 村地坪 / 岸坡 / 护坡 ——————————————————————

  private buildVillage(): void {
    const groundMat = this.track(std(0x5f7a4a, 1));
    const cliffMat = this.track(std(0x6d6353, 1));
    // 南岸村地坪(顶面 y=5.5):缺口西侧 / 东侧 / 远南三块 + 北侧两岸高地两块
    const mk = (cx: number, cz: number, w: number, d: number, mat: THREE.Material): void => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 3.6, d), mat);
      box.position.set(cx, A.deckY - 1.8, cz);
      box.receiveShadow = true;
      this.root.add(box);
    };
    const westX = -((A.notchHalfX + 90) / 2);
    mk(westX, (A.pathZ[1] + 90) / 2, 90 - A.notchHalfX, 90 - A.pathZ[1], groundMat); // 西南
    mk(-westX, (A.pathZ[1] + 90) / 2, 90 - A.notchHalfX, 90 - A.pathZ[1], groundMat); // 东南
    mk(0, (A.notchSouthZ + 90) / 2, A.notchHalfX * 2, 90 - A.notchSouthZ, groundMat); // 远南
    const northD = 60 - Math.abs(A.pathZ[0]);
    mk(westX, -(Math.abs(A.pathZ[0]) + 60) / 2, 90 - A.notchHalfX, northD, cliffMat);
    mk(-westX, -(Math.abs(A.pathZ[0]) + 60) / 2, 90 - A.notchHalfX, northD, cliffMat);

    // 护坡(挡墙)立面:z=-2.5 村道北缘,桥台邻段做砌石护坡,西侧留坍塌缺口
    const revetMatA = this.track(std(0x8a8272, 0.98));
    const revetMatB = this.track(std(0x7b7365, 0.98));
    for (let x = -A.deckHalfX; x < A.deckHalfX; x += 1.55) {
      const w = Math.min(1.5, A.deckHalfX - x);
      if (x >= -11.1 && x <= -7.9) continue; // 西侧坍塌段(见 buildPathAndRamps 的落石)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, A.deckY - A.pathY, 0.24), (Math.round(x) % 2 === 0 ? revetMatA : revetMatB));
      panel.position.set(x + w / 2, (A.deckY + A.pathY) / 2, A.pathZ[1] + 0.12);
      panel.receiveShadow = true;
      this.root.add(panel);
    }
    // 坍塌段:缺面板处露出土体 + 两块歪落砌石
    const earth = new THREE.Mesh(new THREE.BoxGeometry(3.2, A.deckY - A.pathY - 0.4, 0.3), this.track(std(0x6d5a44, 1)));
    earth.position.set(-9.5, (A.deckY + A.pathY) / 2, A.pathZ[1] + 0.1);
    earth.receiveShadow = true;
    this.root.add(earth);
    for (const [rx, ry, rr] of [
      [-10.4, 0.75, 0.5],
      [-8.9, 0.65, -0.7],
    ] as const) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.5), revetMatA);
      block.position.set(rx, ry, A.pathZ[1] + 0.45);
      block.rotation.z = rr;
      block.castShadow = true;
      this.root.add(block);
    }
  }

  // —————————————————————— 河滩便道 + 坡道 ——————————————————————

  private buildPathAndRamps(): void {
    const pathMat = this.track(std(0x8f8674, 0.98));
    // 便道条带(横过河谷的干滩,顶面 y=0.4)
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(A.rampOuterX * 2, A.pathY + 1.3, A.pathZ[1] - A.pathZ[0] + 0.1),
      pathMat,
    );
    path.position.set(0, (A.pathY - 1.3) / 2, (A.pathZ[0] + A.pathZ[1]) / 2);
    path.receiveShadow = true;
    this.root.add(path);
    // 两端坡道(与 surfacesAt 的线性坡一致,32.5° 石板坡)
    const slopeLen = Math.hypot(A.rampOuterX - A.rampInnerX, A.deckY - A.pathY);
    const angle = Math.atan2(A.deckY - A.pathY, A.rampOuterX - A.rampInnerX);
    for (const dir of [1, -1] as const) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(slopeLen + 0.4, 0.3, A.pathZ[1] - A.pathZ[0] + 0.1), pathMat);
      ramp.position.set(
        dir * (A.rampInnerX + A.rampOuterX) / 2,
        (A.pathY + A.deckY) / 2 - 0.15,
        (A.pathZ[0] + A.pathZ[1]) / 2,
      );
      ramp.rotation.z = dir * angle;
      ramp.receiveShadow = true;
      this.root.add(ramp);
    }
    // 缺口北缘矮挡坎(防止从便道迈进桥下过水区)
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(A.notchHalfX * 2, 0.4, 0.24),
      this.track(std(0x8a8272, 0.98)),
    );
    curb.position.set(0, A.pathY + 0.2, A.pathZ[1] + 0.02);
    this.root.add(curb);
    this.colliders.push({ minX: -A.notchHalfX, maxX: A.notchHalfX, minY: -1, maxY: 6.5, minZ: A.pathZ[1], maxZ: A.pathZ[1] + 0.25 });
    // 便道北缘挡墙(拦住走进北侧河面)
    this.colliders.push({ minX: -A.rampOuterX, maxX: A.rampOuterX, minY: -1, maxY: 6.5, minZ: A.pathZ[0] - 0.25, maxZ: A.pathZ[0] });
    // 缺口两侧壁(从村道侧不可踏入过水区)
    for (const s of [1, -1] as const) {
      this.colliders.push({
        minX: s > 0 ? A.notchHalfX : -A.notchHalfX - 0.4,
        maxX: s > 0 ? A.notchHalfX + 0.4 : -A.notchHalfX,
        minY: -1,
        maxY: 6.5,
        minZ: A.pathZ[1],
        maxZ: A.notchSouthZ,
      });
    }
    // 缺口南端挡墙
    this.colliders.push({ minX: -A.notchHalfX, maxX: A.notchHalfX, minY: -1, maxY: 6.5, minZ: A.notchSouthZ, maxZ: A.notchSouthZ + 0.4 });
  }

  // —————————————————————— 桥台 / 拱圈 / 侧墙 ——————————————————————

  private buildAbutments(): void {
    const mat = this.track(std(0x93927f, 0.96));
    for (const dir of [1, -1] as const) {
      const w = A.deckHalfX - A.halfSpan;
      const abut = new THREE.Mesh(new THREE.BoxGeometry(w, A.deckY + 1.2, 5.2), mat);
      abut.position.set(dir * (A.halfSpan + w / 2), (A.deckY - 1.2) / 2, 0.1);
      abut.castShadow = true;
      abut.receiveShadow = true;
      this.root.add(abut);
      this.colliders.push({
        minX: dir > 0 ? A.halfSpan : -A.deckHalfX,
        maxX: dir > 0 ? A.deckHalfX : -A.halfSpan,
        minY: 0,
        maxY: A.deckY,
        minZ: A.pathZ[1],
        maxZ: 2.7,
      });
    }
  }

  private buildArchRing(): void {
    // 13 块楔形拱石(端面即立面上可见砌缝);拱石松动块(拱顶偏东)微外倾
    const stoneA = this.track(std(0x9a9484, 0.95));
    const stoneB = this.track(std(0x8d8878, 0.95));
    const loose = this.track(std(0xa39a86, 0.95));
    const step = (A.halfSpan * 2) / A.ringBlocks;
    for (let i = 0; i < A.ringBlocks; i += 1) {
      const xc = -A.halfSpan + (i + 0.5) * step;
      const yc = archIntradosY(xc) + A.ringThickness / 2;
      const isLoose = Math.abs(xc - 0.87) < step; // 拱顶偏东的松动拱石
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(step * 1.18, A.ringThickness, A.deckHalfZ * 2),
        isLoose ? loose : i % 2 === 0 ? stoneA : stoneB,
      );
      block.position.set(xc, yc, 0);
      block.rotation.z = Math.atan(-((2 * A.rise) / A.halfSpan ** 2) * xc);
      if (isLoose) {
        block.rotation.z += 0.045; // 微外倾(可视化「外鼓松动」)
        block.position.y += 0.05;
      }
      block.castShadow = true;
      block.receiveShadow = true;
      this.root.add(block);
    }
  }

  private buildSpandrels(): void {
    // 拱上侧墙:沿拱背曲线到桥面的砌石面板(北面是检测主立面)
    const matN = this.track(std(0x8f897a, 0.96));
    const matS = this.track(std(0x87816f, 0.96));
    for (const side of [1, -1] as const) {
      for (let x = -6.6; x < 6.6; x += 1.2) {
        const topOfArch = archIntradosY(x + 0.6) + A.ringThickness;
        const h = A.deckY - topOfArch;
        if (h <= 0.05) continue;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.14, h, 0.45), side > 0 ? matN : matS);
        panel.position.set(x + 0.6, topOfArch + h / 2, side * (A.deckHalfZ + 0.225));
        panel.castShadow = true;
        panel.receiveShadow = true;
        this.root.add(panel);
      }
    }
  }

  // —————————————————————— 桥面 / 护栏 ——————————————————————

  private buildDeckAndParapets(): void {
    const deckMat = this.track(std(0xa19a89, 0.97));
    const deck = new THREE.Mesh(new THREE.BoxGeometry(A.deckHalfX * 2, 0.3, A.deckHalfZ * 2), deckMat);
    deck.position.set(0, A.deckY - 0.15, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.root.add(deck);

    // 石砌护栏(北面西段留破损缺口——栏杆破损热点)
    const railMat = this.track(std(0x97917f, 0.96));
    const capMat = this.track(std(0x8a8474, 0.93));
    const mkRail = (x0: number, x1: number, side: number): void => {
      const w = x1 - x0;
      if (w <= 0.05) return;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, 0.4), railMat);
      wall.position.set((x0 + x1) / 2, A.deckY + 0.425, side * A.parapetZ);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.root.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.12, 0.52), capMat);
      cap.position.set((x0 + x1) / 2, A.parapetTopY, side * A.parapetZ);
      cap.castShadow = true;
      this.root.add(cap);
      this.colliders.push({
        minX: x0,
        maxX: x1,
        minY: A.deckY,
        maxY: A.parapetTopY,
        minZ: side * A.parapetZ - 0.2,
        maxZ: side * A.parapetZ + 0.2,
      });
    };
    // 北侧:西段 | 破损段(-6 ~ -4.6,矮墩+碎块,碰撞体保留防跌落)| 东段
    mkRail(-A.deckHalfX, -6, -1);
    mkRail(-4.6, A.deckHalfX, -1);
    mkRail(-A.deckHalfX, A.deckHalfX, 1);
    // 破损段的隐形护栏碰撞体(防跌入桥下过水死区)
    this.colliders.push({
      minX: -6,
      maxX: -4.6,
      minY: A.deckY,
      maxY: A.parapetTopY,
      minZ: -A.parapetZ - 0.2,
      maxZ: -A.parapetZ + 0.2,
    });
    // 破损段视觉:低矮残墩 + 散落碎块(碰撞由两侧段与碎块堆共同兜住)
    for (const [rx, rh] of [[-5.7, 0.4], [-4.9, 0.55]] as const) {
      const stub = new THREE.Mesh(new THREE.BoxGeometry(0.5, rh, 0.4), railMat);
      stub.position.set(rx, A.deckY + rh / 2, -A.parapetZ);
      stub.castShadow = true;
      this.root.add(stub);
    }
    for (const [rx, ry, rz] of [
      [-5.3, 5.68, -1.95],
      [-5.0, 5.9, -2.0],
      [-5.55, 6.05, -2.1],
    ] as const) {
      const rubble = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.4), railMat);
      rubble.position.set(rx, ry, rz);
      rubble.rotation.y = 0.4;
      this.root.add(rubble);
    }
  }

  // —————————————————————— 水系 / 树木 ——————————————————————

  private buildWater(): void {
    const waterMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x6b6a4e, // 暴雨后浑水
        roughness: 0.42,
        metalness: 0.05,
        transparent: true,
        opacity: 0.93,
      }),
    );
    // 北侧宽河面
    const north = new THREE.Mesh(new THREE.PlaneGeometry(300, 256), waterMat);
    north.rotation.x = -Math.PI / 2;
    north.position.set(0, A.waterY, -(Math.abs(A.pathZ[0]) + 128));
    this.root.add(north);
    // 桥下过水缺口(南延至缺口南端)
    const notch = new THREE.Mesh(
      new THREE.PlaneGeometry(A.notchHalfX * 2, A.notchSouthZ - A.pathZ[1]),
      waterMat,
    );
    notch.rotation.x = -Math.PI / 2;
    notch.position.set(0, A.waterY, (A.pathZ[1] + A.notchSouthZ) / 2);
    this.root.add(notch);
    this.water.push(north, notch);
  }

  private buildTrees(): void {
    const trunkMat = this.track(std(0x5d4a33, 1));
    const crownMat = this.track(std(0x40632f, 1));
    const trees: [number, number, number][] = [
      [-24, 8.5, 6],
      [-16, 14, 7.5],
      [18, 9.5, 6.5],
      [26, 16, 7],
    ];
    for (const [x, z, h] of trees) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, h * 0.42, 6), trunkMat);
      trunk.position.set(x, A.deckY + (h * 0.42) / 2, z);
      trunk.castShadow = true;
      this.root.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h * 0.72, 7), crownMat);
      crown.position.set(x, A.deckY + h * 0.42 + h * 0.36, z);
      crown.castShadow = true;
      this.root.add(crown);
    }
  }

  // —————————————————————— 天空 / 光照(暴雨后)——————————————————————

  private static makeSkyTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0.0, '#4a5a63'); // 铅灰天顶
      grad.addColorStop(0.42, '#75858c');
      grad.addColorStop(0.52, '#98a4a6'); // 近地亮带(雨雾)
      grad.addColorStop(0.62, '#7f8884');
      grad.addColorStop(1.0, '#6d7570');
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
    scene.fog = new THREE.Fog(0x8b9799, 70, 300);
    const hemi = new THREE.HemisphereLight(0x9fb3b8, 0x5c6152, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xcfd8dc, 1.1); // 阴天漫射
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -60;
    cam.right = 60;
    cam.top = 50;
    cam.bottom = -40;
    cam.near = 10;
    cam.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
  }

  update(elapsedSec: number): void {
    // 洪水水面湍动(幅度大于常水位)
    for (const w of this.water) w.position.y = A.waterY + Math.sin(elapsedSec * 1.6) * 0.05;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    this.skyTexture.dispose();
    this.root.clear();
  }

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }
}

/** 资产工厂:案件二程序石拱桥(M2 可用 withLux3dVisuals 包装换 glb 视觉)。 */
export const createStoneArchAsset: LevelAssetFactory = (level) => new StoneArchAsset(level);
