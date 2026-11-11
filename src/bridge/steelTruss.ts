/**
 * 钱塘江大桥 1937 · 桥殇 —— 参数化程序占位模型(案件三,M2 旗舰)。
 *
 * 史实(SOURCES.md 核对稿):正桥 16 孔双层公铁两用华伦式铆接钢桁梁,
 * 1937-09-26 通车、12-23 通车 89 天自毁阻敌——五孔钢梁折断落江、两座桥墩被毁。
 * 本占位场景按「可见简化」复原:西岸两孔完好桁架(下层铁路面可行走)
 * + 断口(墩2 墩顶炸毁)+ 两孔落江残骸 + 墩3 残墩 + 远东岸;上层公路面仅作外观。
 *
 * 布局(米,坐标系与前两案一致:桥轴 X 西→东,北 = -Z):
 * - 下层铁路面 y=7.0:西桥台 x=-52 → 墩1 x=-34 → 墩2/断口 x=-16,可行走;
 * - 桁架:孔跨 18m×6 节间,下弦 y=6.8、上弦 y=12.3,桁宽 z=±3.2;
 *   双层:上层公路面 y≈12.6(不可达,外观);
 * - 断口以东:落江桁架残骸(倾斜露出水面)+ 墩3 残顶 + 远东岸(雾中);
 * - 氛围:黄昏硝烟——低角度暖光、烟灰雾、暗色江面。
 *
 * 性能:杆件用共享单位盒 + 逐杆缩放旋转(几何仅 1 份),全场景 ~200 Mesh。
 * M2 换 Lux3D 资产后本文件作占位参考。
 */

import * as THREE from 'three';
import type { LevelAsset, LevelAssetFactory } from './levelAsset';
import type { Aabb, SurfaceSampler } from '../player/terrain';
import type { LevelData } from '../game/level';

/** 几何常数(米)。关卡 JSON 的热点坐标以此为准。 */
export const TRUSS = {
  deckY: 7.0,
  deckEndX: -16, // 断口(可行走段东界)
  abutmentX: -52, // 西桥台 / 西岸分界
  pier1X: -34,
  pier2X: -16,
  pier3X: 2,
  spanLen: 18,
  panels: 6,
  chordBottomY: 6.8,
  chordTopY: 12.3,
  trussZ: 3.2,
  deckHalfZ: 3.5,
  waterY: -0.4,
} as const;

const T = TRUSS;
const PW = T.spanLen / T.panels; // 节间长 3m
const UP = new THREE.Vector3(0, 1, 0);

function std(color: number, roughness = 0.85, metalness = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** 程序钢桁梁桥资产。 */
class SteelTrussAsset implements LevelAsset {
  readonly root = new THREE.Group();
  readonly colliders: Aabb[] = [];
  readonly spawn;
  private water: THREE.Mesh | null = null;
  private readonly materials: THREE.Material[] = [];
  private readonly skyTexture: THREE.CanvasTexture;
  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  /** 杆件材质(新旧/锈蚀差异) */
  private readonly matSteel!: THREE.MeshStandardMaterial;
  private readonly matSteelDark!: THREE.MeshStandardMaterial;
  private readonly matRust!: THREE.MeshStandardMaterial;
  private readonly matRustDark!: THREE.MeshStandardMaterial;

  readonly surfacesAt: SurfaceSampler = (x, z) => {
    if (x <= T.abutmentX && Math.abs(z) <= 25) return [T.deckY]; // 西岸(铁路路基同高)
    if (x > T.abutmentX && x <= T.deckEndX && Math.abs(z) <= T.deckHalfZ) return [T.deckY]; // 下层铁路面
    return [];
  };

  constructor(level: LevelData) {
    this.spawn = {
      x: level.spawn.position[0],
      y: level.spawn.position[1],
      z: level.spawn.position[2],
      yawDeg: level.spawn.yawDeg,
    };
    this.matSteel = this.track(std(0x5c6673, 0.8, 0.4));
    this.matSteelDark = this.track(std(0x47515e, 0.85, 0.35));
    this.matRust = this.track(std(0x8a5a3a, 0.95, 0.2));
    this.matRustDark = this.track(std(0x6e4429, 0.98, 0.15));
    this.skyTexture = SteelTrussAsset.makeSkyTexture();

    this.buildBanks();
    this.buildWater();
    this.buildPiers();
    this.buildSpans();
    this.buildDeck();
    this.buildWreck();
    this.root.name = 'qiantang-steel-truss-1937';
  }

  // —————————————————————— 杆件工具 ——————————————————————

  /** 在两点之间放一根方截面杆(共享单位盒,缩放 + 旋转)。 */
  private member(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    thickness: number,
    mat: THREE.Material,
    broken = false,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const place = (a: THREE.Vector3, l: number): void => {
      const mesh = new THREE.Mesh(this.unitBox, mat);
      mesh.scale.set(thickness, l, thickness);
      mesh.position.copy(a);
      mesh.quaternion.setFromUnitVectors(UP, dir);
      mesh.castShadow = true;
      this.root.add(mesh);
    };
    if (!broken) {
      place(new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), len);
      return;
    }
    // 断杆:两端各留 32% 残段,中间缺失
    const pA = new THREE.Vector3(x1, y1, z1);
    const pB = new THREE.Vector3(x2, y2, z2);
    place(pA.clone().addScaledVector(dir, len * 0.16), len * 0.32);
    place(pB.clone().addScaledVector(dir, -len * 0.16), len * 0.32);
  }

  /** 一孔华伦式桁架(双侧主桁 + 上下平联 + 横撑),x0 为西端节点。 */
  private buildTrussSpan(x0: number, style: 'intact' | 'damaged' | 'rusty'): void {
    const matMain = style === 'rusty' ? this.matSteelDark : this.matSteel;
    const bottomY = T.chordBottomY;
    const topY = T.chordTopY;
    for (const side of [1, -1] as const) {
      const z = side * T.trussZ;
      // 上下弦(逐节间)
      for (let i = 0; i < T.panels; i += 1) {
        const xa = x0 + i * PW;
        const xb = xa + PW;
        this.member(xa, bottomY, z, xb, bottomY, z, 0.34, matMain);
        this.member(xa, topY, z, xb, topY, z, 0.3, matMain);
      }
      // 竖杆(全部节点)
      for (let i = 0; i <= T.panels; i += 1) {
        const x = x0 + i * PW;
        // 损伤可视化:断口邻跨西起第 3 根北面竖杆「目视弯曲」(两段错位)
        if (style === 'damaged' && side === -1 && i === 3) {
          const xm = x0 + 3 * PW;
          const yMid = (bottomY + topY) / 2;
          this.member(xm, bottomY, z, xm + 0.28, yMid, z, 0.22, matMain);
          this.member(xm + 0.28, yMid, z, xm, topY, z, 0.22, matMain);
          continue;
        }
        this.member(x, bottomY, z, x, topY, z, 0.22, matMain);
      }
      // 斜杆(华伦式交替)
      for (let i = 0; i < T.panels; i += 1) {
        const xa = x0 + i * PW;
        const xb = xa + PW;
        const isEndDiag = i === T.panels - 1 && style === 'damaged'; // 断口端斜杆 = 断杆热点
        if (i % 2 === 0) {
          this.member(xa, bottomY, z, xb, topY, z, 0.2, i % 4 === 1 ? this.matSteelDark : matMain, isEndDiag);
        } else {
          this.member(xa, topY, z, xb, bottomY, z, 0.2, matMain, isEndDiag);
        }
      }
      // 锈蚀可视化:下弦东段第 2 节间换锈材质
      if (style === 'damaged') {
        this.member(x0 + PW, bottomY, z, x0 + 2 * PW, bottomY, z, 0.34, this.matRust);
      }
    }
    // 下平联 + 上平联(隔档交叉)
    for (let i = 0; i < T.panels; i += 2) {
      const xa = x0 + i * PW;
      const xb = xa + 2 * PW;
      this.member(xa, bottomY, -T.trussZ, xb, bottomY, T.trussZ, 0.14, this.matSteelDark);
      this.member(xa, topY, T.trussZ, xb, topY, -T.trussZ, 0.14, this.matSteelDark);
    }
    // 横撑(节点处连接两侧桁面)
    for (const i of [0, 3, 6]) {
      const x = x0 + i * PW;
      this.member(x, topY, -T.trussZ, x, topY, T.trussZ, 0.16, this.matSteelDark);
    }
    // 上层公路面(外观不可达)
    const roadMat = this.track(std(0x3d434b, 0.92, 0.1));
    const slab = new THREE.Mesh(new THREE.BoxGeometry(T.spanLen - 0.6, 0.3, 6.4), roadMat);
    slab.position.set(x0 + T.spanLen / 2, T.chordTopY + 0.15, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.root.add(slab);
    for (const side of [1, -1] as const) {
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(T.spanLen - 0.6, 0.7, 0.14), this.matSteelDark);
      parapet.position.set(x0 + T.spanLen / 2, T.chordTopY + 0.65, side * 3.1);
      this.root.add(parapet);
    }
    const lineMat = this.track(std(0xc9b46a, 0.8));
    for (let i = 0; i < 3; i += 1) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.16), lineMat);
      dash.position.set(x0 + 3 + i * 6, T.chordTopY + 0.32, 0);
      this.root.add(dash);
    }
  }

  // —————————————————————— 岸 / 水 ——————————————————————

  private buildBanks(): void {
    const bankMat = this.track(std(0x55584a, 1));
    const west = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 50), bankMat);
    west.position.set(-65, 3.5, 0);
    west.receiveShadow = true;
    this.root.add(west);
    // 西岸防汛矮墙(视觉)+ 隐形全高阻挡(防落水死区)
    const wallMat = this.track(std(0x7d7f78, 0.95));
    for (const side of [1, -1] as const) {
      const lowWall = new THREE.Mesh(new THREE.BoxGeometry(26, 1.1, 0.4), wallMat);
      lowWall.position.set(-65, 7.55, side * 25);
      this.root.add(lowWall);
      this.colliders.push({ minX: -78, maxX: -52, minY: 0, maxY: 12, minZ: side > 0 ? 25 : 25.4, maxZ: side > 0 ? 25.4 : 25 });
    }
    // 远东岸(雾中,不可达)
    const east = new THREE.Mesh(new THREE.BoxGeometry(60, 7, 50), bankMat);
    east.position.set(48, 3.5, 0);
    this.root.add(east);
    // 西桥台(铁路面接入)
    const abutMat = this.track(std(0x8f959b, 0.9, 0.1));
    const abut = new THREE.Mesh(new THREE.BoxGeometry(3.2, 8.5, 7.4), abutMat);
    abut.position.set(-53.2, 2.75, 0);
    abut.castShadow = true;
    this.root.add(abut);
  }

  private buildWater(): void {
    const waterMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x46525c, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.94 }),
    );
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(360, 300), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, T.waterY, 0);
    this.root.add(this.water);
  }

  // —————————————————————— 桥墩 ——————————————————————

  private buildPiers(): void {
    const concrete = this.track(std(0x9aa0a6, 0.9, 0.05));
    const scorched = this.track(std(0x7e7a72, 0.95, 0.05));
    // 墩1(完好):身体 + 墩帽 + 支座
    const mkBody = (cx: number, topY: number, mat: THREE.Material): void => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, topY + 1.5, 6.8), mat);
      body.position.set(cx, (topY - 1.5) / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      this.root.add(body);
    };
    mkBody(T.pier1X, 6.0, concrete);
    const cap1 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 7.6), concrete);
    cap1.position.set(T.pier1X, 6.25, 0);
    this.root.add(cap1);
    for (const dx of [-0.9, 0.9]) {
      for (const dz of [-T.trussZ, T.trussZ]) {
        const bearing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), this.matSteelDark);
        bearing.position.set(T.pier1X + dx, 6.7, dz);
        this.root.add(bearing);
      }
    }
    // 墩2(断口处,墩顶炸毁):残身 + 歪斜碎块 + 露筋 + 死咬支座
    mkBody(T.pier2X, 5.4, scorched);
    const chunkA = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 3.2), scorched);
    chunkA.position.set(T.pier2X - 0.4, 5.8, 0.6);
    chunkA.rotation.z = 0.16;
    this.root.add(chunkA);
    const chunkB = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.8), scorched);
    chunkB.position.set(T.pier2X + 0.5, 5.5, -0.8);
    chunkB.rotation.z = -0.22;
    this.root.add(chunkB);
    for (const [dx, dz, tilt] of [
      [-1.2, -1.8, 0.35],
      [-0.4, 1.4, -0.28],
      [0.8, -1.1, 0.2],
      [1.4, 1.9, -0.4],
      [0.2, -2.2, 0.5],
    ] as const) {
      const rebar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.3, 0.07), this.matRustDark);
      rebar.position.set(T.pier2X + dx, 6.1, dz);
      rebar.rotation.z = tilt;
      this.root.add(rebar);
    }
    const jammedBearing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.7), this.matRust);
    jammedBearing.position.set(T.pier2X - 0.3, 6.55, -2.2);
    jammedBearing.rotation.z = 0.45; // 歪斜卡死(落梁风险热点)
    this.root.add(jammedBearing);
    // 墩3(落江孔东侧,残顶)
    mkBody(T.pier3X, 3.4, scorched);
    const jagA = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.0), scorched);
    jagA.position.set(T.pier3X - 0.3, 3.7, 0.4);
    jagA.rotation.z = 0.2;
    this.root.add(jagA);
    const jagB = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 2.6), scorched);
    jagB.position.set(T.pier3X + 0.4, 3.5, -0.5);
    jagB.rotation.z = -0.18;
    this.root.add(jagB);
  }

  // —————————————————————— 主桁两孔 + 断口屏障 ——————————————————————

  private buildSpans(): void {
    this.buildTrussSpan(T.abutmentX, 'intact'); // -52..-34
    this.buildTrussSpan(T.pier1X, 'damaged'); // -34..-16(断口邻跨:断杆/弯杆/锈弦)
    // 桁面纵向阻挡(防侧跌):两侧各一条长 AABB
    for (const side of [1, -1] as const) {
      this.colliders.push({
        minX: T.abutmentX,
        maxX: T.deckEndX,
        minY: T.chordBottomY - 0.2,
        maxY: T.chordTopY + 0.4,
        minZ: side > 0 ? T.trussZ - 0.25 : T.trussZ,
        maxZ: side > 0 ? T.trussZ : T.trussZ + 0.25,
      });
    }
    // 断口屏障(墩2 处,防走入落江孔)
    this.colliders.push({ minX: T.deckEndX - 0.3, maxX: T.deckEndX, minY: 5.5, maxY: 13.2, minZ: -4, maxZ: 4 });
    const tornRail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.1), this.matRustDark);
    tornRail.position.set(T.deckEndX + 0.8, 6.9, 0.75);
    tornRail.rotation.z = -0.5; // 断口悬空下弯钢轨
    this.root.add(tornRail);
    const tornRail2 = tornRail.clone();
    tornRail2.position.z = -0.75;
    this.root.add(tornRail2);
  }

  // —————————————————————— 下层铁路面 ——————————————————————

  private buildDeck(): void {
    const ballastMat = this.track(std(0x4a4d52, 0.98, 0.05));
    const deckLen = T.deckEndX - T.abutmentX - 0.4;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.5, T.deckHalfZ * 2), ballastMat);
    deck.position.set((T.abutmentX + T.deckEndX) / 2 - 0.2, T.deckY - 0.25, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.root.add(deck);
    // 钢轨(断口西 2.5m 起「枕木缺失区」止)
    const railMat = this.track(std(0x6e747d, 0.5, 0.7));
    for (const rz of [-0.75, 0.75]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(33.2, 0.16, 0.1), railMat);
      rail.position.set(T.abutmentX + 33.2 / 2, T.deckY + 0.12, rz);
      this.root.add(rail);
    }
    // 枕木(每 1.2m;断口邻段缺 3 根 = 桥面破坏热点)
    const sleeperMat = this.track(std(0x5c4a35, 1, 0));
    for (let x = T.abutmentX + 0.8; x < T.deckEndX - 0.5; x += 1.2) {
      if (x > -19.6 && x < -16.8) continue;
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 2.6), sleeperMat);
      sleeper.position.set(x, T.deckY + 0.05, 0);
      sleeper.receiveShadow = true;
      this.root.add(sleeper);
    }
    // 检修步道矮护栏(南侧,浮锈热点)
    for (let x = T.abutmentX + 1; x < T.deckEndX - 1; x += 4) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), this.matSteelDark);
      post.position.set(x, T.deckY + 0.45, 3.05);
      this.root.add(post);
    }
    const handrail = new THREE.Mesh(new THREE.BoxGeometry(34, 0.07, 0.07), this.matRust);
    handrail.position.set((T.abutmentX + T.deckEndX) / 2, T.deckY + 0.88, 3.05);
    this.root.add(handrail);
  }

  // —————————————————————— 落江残骸 ——————————————————————

  private buildWreck(): void {
    // 落江孔(墩2→墩3):单桁面残骸倾斜半没入江,顶弦局部露出水面
    const wreck = new THREE.Group();
    const add = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, th: number, mat: THREE.Material): void => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dy, dz);
      const mesh = new THREE.Mesh(this.unitBox, mat);
      mesh.scale.set(th, len, th);
      mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      mesh.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).normalize());
      mesh.castShadow = true;
      wreck.add(mesh);
    };
    // 局部桁面(4 节间)自西(高)向东(没水)
    for (let i = 0; i < 4; i += 1) {
      const xa = i * PW;
      const xb = xa + PW;
      add(xa, 3.4, 0, xb, 3.4, 0, 0.34, this.matRust); // 顶弦
      add(xa, 0, 0, xb, 0, 0, 0.3, this.matRustDark); // 底弦(没水)
      add(xa, 0, 0, xa, 3.4, 0, 0.2, this.matRustDark); // 竖杆
      if (i % 2 === 0) add(xa, 0, 0, xb, 3.4, 0, 0.18, this.matRust); // 斜杆
      else add(xa, 3.4, 0, xb, 0, 0, 0.18, this.matRustDark);
      add(xa, 3.4, 0, xb, 3.4, 1.4, 0.12, this.matRustDark); // 残存平联
    }
    // 第 3 节点竖杆缺失(断杆缺口之一)
    wreck.rotation.z = -0.38; // 西端翘出水面
    wreck.rotation.y = 0.12;
    wreck.position.set(-15.2, -0.6, 1.6);
    this.root.add(wreck);
    // 一块翘出的公路面板
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.35, 3), this.matSteelDark);
    chunk.position.set(-8.6, 1.35, 0.2);
    chunk.rotation.z = -0.34;
    chunk.rotation.y = 0.1;
    chunk.castShadow = true;
    this.root.add(chunk);
  }

  // —————————————————————— 天空 / 光照(黄昏硝烟)——————————————————————

  private static makeSkyTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0.0, '#232f3d'); // 暮蓝天顶
      grad.addColorStop(0.4, '#54514c');
      grad.addColorStop(0.52, '#8a6f52'); // 西天余烬
      grad.addColorStop(0.6, '#6e6154'); // 硝烟地平
      grad.addColorStop(1.0, '#4a443e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 几抹烟柱
      ctx.fillStyle = 'rgba(58, 54, 50, 0.35)';
      for (const [sx, w] of [[180, 60], [430, 90], [700, 50], [880, 80]] as const) {
        ctx.fillRect(sx, 120, w, 150);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  decorateScene(scene: THREE.Scene): void {
    scene.background = this.skyTexture;
    scene.fog = new THREE.Fog(0x7d7568, 55, 260);
    const hemi = new THREE.HemisphereLight(0x8a94a0, 0x4a443c, 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd2a8, 1.7); // 低角度暖光
    sun.position.set(-70, 34, -45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -70;
    cam.right = 70;
    cam.top = 60;
    cam.bottom = -30;
    cam.near = 10;
    cam.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
  }

  update(elapsedSec: number): void {
    if (this.water) this.water.position.y = T.waterY + Math.sin(elapsedSec * 0.55) * 0.04;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry !== this.unitBox) obj.geometry.dispose();
    });
    this.unitBox.dispose();
    for (const m of this.materials) m.dispose();
    this.skyTexture.dispose();
    this.root.clear();
  }

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }
}

/** 资产工厂:案件三程序钢桁梁桥(M2 可用 withLux3dVisuals 包装换 Lux3D glb)。 */
export const createSteelTrussAsset: LevelAssetFactory = (level) => new SteelTrussAsset(level);
