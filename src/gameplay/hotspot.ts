/**
 * 热点系统:3D 锚点 + 浮动微光标记 + 准星对准检测。
 *
 * - 每个热点一个「八面体核心 + 加性辉光精灵」标记,浮动呼吸;
 * - 玩家准星在交互半径内对准(视锥约 ±24°)时标记高亮,HUD 提示按 E;
 * - 判定后标记变色保留(绿=正确 / 黄=部分 / 红=误判),供结算前回看。
 */

import * as THREE from 'three';
import type { HotspotData } from '../game/level';
import type { JudgmentKind } from '../game/scoring';

/** 缺省交互半径(米);支座等高位构件在关卡 JSON 里单独放宽。 */
const DEFAULT_RADIUS = 3.5;
/** 对准判定锥角(度,半角)。 */
const AIM_CONE_DEG = 24;

type MarkerState = 'pending' | 'active' | 'correct' | 'partial' | 'wrong';

const STATE_COLORS: Record<MarkerState, number> = {
  pending: 0x6fd3ff, // 青:待检测
  active: 0xffd769, // 亮黄:准星对准
  correct: 0x58e07d, // 绿:判定正确
  partial: 0xffc94a, // 橙黄:部分正确
  wrong: 0xff6b6b, // 红:误判
};

interface Marker {
  data: HotspotData;
  group: THREE.Group;
  core: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.Sprite;
  /** 呼吸相位(按热点错开) */
  phase: number;
  state: MarkerState;
}

/** 模块级共享资源(多个 Game 实例复用;进程内不释放)。 */
const CORE_GEOMETRY = new THREE.OctahedronGeometry(0.16);
let glowTexture: THREE.CanvasTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export class HotspotSystem {
  private readonly markers: Marker[] = [];
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpToHotspot = new THREE.Vector3();

  constructor(scene: THREE.Scene, hotspots: readonly HotspotData[]) {
    hotspots.forEach((data, i) => {
      const color = STATE_COLORS.pending;
      const group = new THREE.Group();
      group.position.set(data.position[0], data.position[1], data.position[2]);

      const core = new THREE.Mesh(
        CORE_GEOMETRY,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.6,
          roughness: 0.4,
        }),
      );
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getGlowTexture(),
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.set(1.15, 1.15, 1);
      group.add(core, glow);
      scene.add(group);
      this.markers.push({ data, group, core, glow, phase: i * 1.7, state: 'pending' });
    });
  }

  /**
   * 每帧更新:标记动效 + 计算准星当前对准的可交互热点。
   * 返回对准的热点数据(用于按 E 打开检测弹窗),未对准返回 null。
   */
  update(camera: THREE.Camera, elapsedSec: number, dt: number): HotspotData | null {
    const camPos = camera.position;
    const forward = camera.getWorldDirection(this.tmpDir);

    let best: Marker | null = null;
    let bestScore = -Infinity;

    for (const m of this.markers) {
      // —— 动效:浮动 + 自转 + 辉光呼吸 ——
      m.core.position.y = Math.sin(elapsedSec * 2.1 + m.phase) * 0.12;
      m.core.rotation.y += dt * 1.4;
      const pulse = 1.05 + Math.sin(elapsedSec * 3.0 + m.phase) * 0.12;
      m.glow.scale.set(pulse, pulse, 1);

      if (m.state !== 'pending' && m.state !== 'active') continue;

      // —— 对准检测:距离 + 视锥 ——
      const to = this.tmpToHotspot.copy(m.group.position).sub(camPos);
      const dist = to.length();
      const radius = m.data.interactRadius ?? DEFAULT_RADIUS;
      if (dist > radius || dist < 1e-4) continue;
      to.divideScalar(dist);
      const dot = forward.dot(to);
      if (dot < Math.cos(THREE.MathUtils.degToRad(AIM_CONE_DEG))) continue;

      const score = dot * 10 - dist; // 优先更正对准、更近的热点
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }

    for (const m of this.markers) {
      if (m.state === 'active' && m !== best) this.setState(m, 'pending');
    }
    if (best) this.setState(best, 'active');
    return best ? best.data : null;
  }

  /** 判定后固化标记状态与颜色。 */
  resolve(id: string, kind: JudgmentKind): void {
    const m = this.markers.find((mk) => mk.data.id === id);
    if (!m) return;
    let state: MarkerState;
    switch (kind) {
      case 'correct':
      case 'decoyPass':
        state = 'correct';
        break;
      case 'severityMiss':
        state = 'partial';
        break;
      default:
        state = 'wrong';
        break;
    }
    this.setState(m, state);
    m.glow.material.opacity = 0.45; // 已判定:辉光减弱
    m.core.material.emissiveIntensity = 0.9;
  }

  private setState(m: Marker, state: MarkerState): void {
    if (m.state === state) return;
    m.state = state;
    const color = STATE_COLORS[state];
    m.core.material.color.setHex(color);
    m.core.material.emissive.setHex(color);
    m.glow.material.color.setHex(color);
    const scale = state === 'active' ? 1.45 : 1;
    m.core.scale.setScalar(scale);
  }

  dispose(scene: THREE.Scene): void {
    for (const m of this.markers) {
      scene.remove(m.group);
      m.core.material.dispose();
      m.glow.material.dispose();
    }
    this.markers.length = 0;
  }
}
