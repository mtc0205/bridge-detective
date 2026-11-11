/**
 * 内部关卡编辑器(?editor=1,开发模式)。
 *
 * 目标:M2 三案件内容生产效率 —— 在场景里摆热点、设类型答案与规范文案,
 * 直接导出与 `parseLevel` 契约一致的关卡 JSON(教学关即本编辑器数据格式)。
 *
 * 操作:
 *  - 点击画面锁定指针;WASD 飞行,Q/E 下/上,Shift 加速,Esc 释放指针编辑表单;
 *  - 左键:命中标记=选中;命中桥体=在该处新增热点(沿法线外移 0.18m);
 *  - 右键:删除命中的标记;F:传送到准星命中处;
 *  - 方向键 / PgUp PgDn:微调选中热点位置(Shift ×4);Del:删除;[ ]:切换选中;
 *  - 保存:parseLevel 预校验 → 下载 .json + 复制到剪贴板。
 */

import * as THREE from 'three';
import { parseLevel, serializeLevel, DEFECT_TYPES } from '../game/level';
import type { HotspotData, LevelData } from '../game/level';
import type { LevelAsset, LevelAssetFactory } from '../bridge/levelAsset';
import { EditorPanel } from './editorPanel';

const FLY_SPEED = 9;
const FLY_SPRINT = 26;
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_LIMIT = 1.55;
const NUDGE_STEP = 0.25;

/** 3D 里的热点标记:核心球 + 隐形拾取球 + 落地垂线 + 编号标签。 */
interface EditorMarker {
  data: HotspotData;
  group: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  hit: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  label: THREE.Sprite;
}

const SPHERE_GEOMETRY = new THREE.SphereGeometry(0.26, 14, 10);
const HIT_GEOMETRY = new THREE.SphereGeometry(0.85, 8, 6);

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(8, 14, 22, 0.72)';
    ctx.fillRect(0, 18, 256, 60);
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.7)';
    ctx.strokeRect(0.5, 18.5, 255, 59);
    ctx.font = '600 30px "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = '#cfeaff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 12), 128, 49);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.3, 0.86, 1);
  return sprite;
}

export class EditorApp {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(74, 1, 0.08, 900);
  private readonly asset: LevelAsset;
  private readonly panel: EditorPanel;
  private readonly canvas: HTMLCanvasElement;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly keys = new Set<string>();
  private readonly markers: EditorMarker[] = [];
  private readonly helpEl: HTMLElement;
  private readonly spawnGroup = new THREE.Group();

  private level: LevelData;
  private selectedId: string | null = null;
  private yaw = 0;
  private pitch = 0;
  private disposed = false;

  constructor(host: HTMLElement, level: LevelData, assetFactory: LevelAssetFactory) {
    this.host = host;
    this.level = level;

    // —— 资产 + 光照(与玩法同一 ILevelAsset,M2 换 Lux3D 资产后编辑器同步可用)——
    this.asset = assetFactory(level);
    this.asset.decorateScene(this.scene);
    this.scene.add(this.asset.root);
    this.scene.add(this.spawnGroup);

    // —— 渲染器 ——
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas editor-canvas';
    this.host.append(this.canvas);

    // —— 相机初始位:出生点上方俯瞰 ——
    const sp = this.level.spawn;
    this.camera.position.set(sp.position[0] - 14, sp.position[1] + 10, sp.position[2] + 16);
    this.yaw = Math.atan2(-(sp.position[0] - this.camera.position.x), -(sp.position[2] - this.camera.position.z));
    this.applyCamera();

    // —— 面板 ——
    this.panel = new EditorPanel(host, {
      onSelectHotspot: (id) => this.select(id),
      onMetaChange: () => this.applyMetaForm(),
      onHotspotChange: () => this.applyHotspotForm(),
      onDefectTypesChange: () => this.applyDefectTypes(),
      onAddAtCrosshair: () => this.addAtCrosshair(),
      onDeleteSelected: () => this.deleteSelected(),
      onSpawnHere: () => this.setSpawnHere(),
      onValidate: () => this.validate(),
      onSave: () => this.save(),
      onImport: (text) => this.importJson(text),
      onExit: () => {
        window.location.href = window.location.pathname; // 退出 ?editor=1 回游戏入口
      },
    });
    this.panel.setLevel(this.level);
    this.refreshMarkers();
    this.refreshSpawnMarker();

    // —— 帮助条(左上)——
    this.helpEl = document.createElement('div');
    this.helpEl.className = 'editor-help';
    this.helpEl.innerHTML =
      '<b>左键</b> 选中 / 空处新增 · <b>右键</b> 删除 · <b>F</b> 传送到准星 · ' +
      '<b>WASD+Q/E</b> 飞行 · <b>Shift</b> 加速 · <b>方向键/PgUpPgDn</b> 微调 · <b>[ ]</b> 切换 · <b>Del</b> 删除 · <b>Esc</b> 释放指针';
    this.host.append(this.helpEl);

    // —— 事件 ——
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.clearKeys);
    this.canvas.addEventListener('mousedown', this.onCanvasMouseDown);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('click', () => this.requestLock());

    this.onResize();
    this.panel.setStatus('编辑器就绪:点击画面锁定指针后左键摆点,Esc 释放指针编辑属性。');
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  // —————————————————————— 帧循环 ——————————————————————

  private readonly frame = (): void => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.updateFly(dt);
    this.asset.update(this.clock.elapsedTime, dt);
    // 标签始终面向相机(Sprite 自带);选中标记缓慢旋转便于辨认
    for (const m of this.markers) m.core.rotation.y += dt * (m.data.id === this.selectedId ? 2.4 : 0.5);
    this.renderer.render(this.scene, this.camera);
  };

  private updateFly(dt: number): void {
    const locked = document.pointerLockElement === this.canvas;
    if (!locked) return;
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? FLY_SPRINT : FLY_SPEED;
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const rise = (this.keys.has('KeyE') || this.keys.has('Space') ? 1 : 0) - (this.keys.has('KeyQ') || this.keys.has('ControlLeft') ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos),right = (cos, -sin)
    let mx = -sin * forward + cos * strafe;
    let my = rise;
    let mz = -cos * forward - sin * strafe;
    const len = Math.hypot(mx, my, mz);
    if (len > 1e-4) {
      mx /= len;
      my /= len;
      mz /= len;
      this.camera.position.x += mx * speed * dt;
      this.camera.position.y = Math.max(0.4, this.camera.position.y + my * speed * dt); // 不穿地
      this.camera.position.z += mz * speed * dt;
    }
  }

  private applyCamera(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // —————————————————————— 拾取 / 摆放 ——————————————————————

  /** 准星射线:先试标记拾取球,再试桥体。 */
  private aimHit(): { marker: EditorMarker } | { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hitMeshes = this.markers.map((m) => m.hit);
    const markerHit = this.raycaster.intersectObjects(hitMeshes, false)[0];
    if (markerHit) {
      const marker = this.markers.find((m) => m.hit === markerHit.object);
      if (marker) return { marker };
    }
    const sceneHit = this.raycaster.intersectObject(this.asset.root, true)[0];
    if (!sceneHit) return null;
    return { point: sceneHit.point.clone(), normal: sceneHit.face ? sceneHit.face.normal.clone().transformDirection(sceneHit.object.matrixWorld) : new THREE.Vector3(0, 1, 0) };
  }

  private onCanvasMouseDown = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return; // 未锁定时不误触
    const hit = this.aimHit();
    if (!hit) return;
    if (e.button === 0) {
      if ('marker' in hit) this.select(hit.marker.data.id);
      else this.addHotspot(hit.point.addScaledVector(hit.normal, 0.18));
    } else if (e.button === 2 && 'marker' in hit) {
      this.deleteHotspot(hit.marker.data.id);
    }
  };

  private addAtCrosshair(): void {
    const hit = this.aimHit();
    if (!hit || !('point' in hit)) {
      this.panel.setStatus('准星未命中桥体:把视线对准要摆点的表面再新增。', false);
      return;
    }
    this.addHotspot(hit.point.addScaledVector(hit.normal, 0.18));
  }

  private addHotspot(position: THREE.Vector3): void {
    const id = this.nextHotspotId();
    const hotspot: HotspotData = {
      id,
      label: `新检测点 ${id}`,
      position: [
        Math.round(position.x * 100) / 100,
        Math.round(position.y * 100) / 100,
        Math.round(position.z * 100) / 100,
      ],
      component: 'deck',
      answer: { type: 'crack', severity: 'medium' },
      description: '(近景描述占位:写清可观察到的病害特征、量测数值)',
      normNote: '(规范依据占位:JTG/T H21-2011 简化条目 + 本例判级理由)',
    };
    this.level.hotspots.push(hotspot);
    this.refreshMarkers();
    this.panel.setLevel(this.level);
    this.select(id);
    this.panel.setStatus(`已新增 ${id}(记得改 label / 答案 / 文案后保存)。`);
  }

  private nextHotspotId(): string {
    const used = new Set(this.level.hotspots.map((h) => h.id));
    let i = this.level.hotspots.length + 1;
    while (used.has(`h${i}`)) i += 1;
    return `h${i}`;
  }

  private deleteSelected(): void {
    if (!this.selectedId) {
      this.panel.setStatus('当前没有选中的检测点。', false);
      return;
    }
    this.deleteHotspot(this.selectedId);
  }

  private deleteHotspot(id: string): void {
    const idx = this.level.hotspots.findIndex((h) => h.id === id);
    if (idx < 0) return;
    this.level.hotspots.splice(idx, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.refreshMarkers();
    this.panel.setLevel(this.level);
    this.panel.setSelection(this.level, this.selectedId);
    this.panel.setStatus(`已删除 ${id}。`);
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.panel.setSelection(this.level, id);
    this.refreshMarkerStates();
    if (id) {
      const h = this.level.hotspots.find((x) => x.id === id);
      if (h) this.panel.setStatus(`选中 ${id} · 可用方向键微调位置。`);
    }
  }

  private cycleSelection(dir: 1 | -1): void {
    const n = this.level.hotspots.length;
    if (n === 0) return;
    const idx = this.level.hotspots.findIndex((h) => h.id === this.selectedId);
    const next = ((idx < 0 ? 0 : idx + dir) + n) % n;
    this.select(this.level.hotspots[next]?.id ?? null);
  }

  private nudgeSelected(dx: number, dy: number, dz: number): void {
    const h = this.level.hotspots.find((x) => x.id === this.selectedId);
    if (!h) return;
    h.position = [
      Math.round((h.position[0] + dx) * 100) / 100,
      Math.round((h.position[1] + dy) * 100) / 100,
      Math.round((h.position[2] + dz) * 100) / 100,
    ];
    this.updateMarkerTransform(h);
    this.panel.syncSelectedHotspot(this.level);
  }

  private teleportToAim(): void {
    const hit = this.aimHit();
    if (!hit || !('point' in hit)) {
      this.panel.setStatus('准星未命中任何表面。', false);
      return;
    }
    this.camera.position.copy(hit.point).addScaledVector(hit.normal, 1.2);
  }

  // —————————————————————— 表单 → 数据 ——————————————————————

  private applyMetaForm(): void {
    const meta = this.panel.getMetaValues(this.level);
    this.level.id = meta.id;
    this.level.caseName = meta.caseName;
    this.level.subtitle = meta.subtitle;
    this.level.brief = meta.brief;
    this.level.timeLimitSec = meta.timeLimitSec;
  }

  private applyHotspotForm(): void {
    const h = this.level.hotspots.find((x) => x.id === this.selectedId);
    if (!h) return;
    const oldId = h.id;
    this.panel.applyHotspotForm(h);
    if (h.id !== oldId && this.level.hotspots.some((x) => x !== h && x.id === h.id)) {
      h.id = oldId; // id 冲突:保留原 id,保存校验会兜底提示
      this.panel.setStatus(`id「${h.id}」已存在,已还原。`, false);
    }
    this.selectedId = h.id;
    this.updateMarkerTransform(h);
    this.refreshMarkerStates();
    this.panel.refreshHotspotList(this.level);
  }

  private applyDefectTypes(): void {
    const checked = this.panel.getCheckedTypes();
    // 空 / 全选时不写字段(= 全集);部分勾选写显式列表
    this.level.defectTypes = checked.length === 0 || checked.length === DEFECT_TYPES.length ? undefined : checked;
  }

  private setSpawnHere(): void {
    const p = this.camera.position;
    const yawDeg = Math.round(THREE.MathUtils.radToDeg(this.yaw));
    this.level.spawn = {
      position: [Math.round(p.x * 10) / 10, Math.round((p.y - 1.65) * 10) / 10, Math.round(p.z * 10) / 10],
      yawDeg,
    };
    this.refreshSpawnMarker();
    this.panel.refreshSpawnInfo(this.level);
    this.panel.setStatus(`出生点已设为当前视角(眼高 1.65m,朝向 ${yawDeg}°)。`);
  }

  // —————————————————————— 校验 / 保存 / 导入 ——————————————————————

  /** 用 parseLevel 做完整契约校验;返回错误信息(或 null)。 */
  private validateForSave(): string | null {
    try {
      parseLevel(JSON.parse(JSON.stringify(serializeLevel(this.level))));
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  private validate(): void {
    const err = this.validateForSave();
    if (err) this.panel.setStatus(`校验未通过:${err}`, false);
    else this.panel.setStatus(`校验通过:${this.level.hotspots.length} 个检测点,数据契约与 parseLevel 一致。`);
  }

  private save(): void {
    const err = this.validateForSave();
    if (err) {
      this.panel.setStatus(`保存中止(先修复):${err}`, false);
      return;
    }
    const json = `${JSON.stringify(serializeLevel(this.level), null, 2)}\n`;
    // 下载
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.level.id}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    // 复制
    void navigator.clipboard
      ?.writeText(json)
      .then(() => this.panel.setStatus(`已保存并复制:${a.download}(放入 src/levels/ 即为新关卡)。`))
      .catch(() => this.panel.setStatus(`已下载 ${a.download};剪贴板复制被浏览器拒绝,请手动复制。`));
  }

  private importJson(text: string): void {
    try {
      const parsed = parseLevel(JSON.parse(text));
      this.level = parsed;
      this.selectedId = null;
      this.refreshMarkers();
      this.refreshSpawnMarker();
      this.panel.setLevel(this.level);
      this.panel.setSelection(this.level, null);
      this.panel.setStatus(`已导入「${parsed.caseName}」(${parsed.hotspots.length} 个检测点)。`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.panel.setStatus(`导入失败:${msg}`, false);
    }
  }

  // —————————————————————— 3D 标记维护 ——————————————————————

  private refreshMarkers(): void {
    for (const m of this.markers) {
      this.scene.remove(m.group);
      m.core.material.dispose();
      m.hit.material.dispose();
      m.line.geometry.dispose();
      m.line.material.dispose();
      m.label.material.map?.dispose();
      m.label.material.dispose();
    }
    this.markers.length = 0;
    this.level.hotspots.forEach((data, i) => {
      const group = new THREE.Group();
      group.position.set(data.position[0], data.position[1], data.position[2]);

      const core = new THREE.Mesh(
        SPHERE_GEOMETRY,
        new THREE.MeshStandardMaterial({ color: 0x6fd3ff, emissive: 0x6fd3ff, emissiveIntensity: 1.4, roughness: 0.35 }),
      );
      const hit = new THREE.Mesh(
        HIT_GEOMETRY,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -data.position[1], 0),
      ]);
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.4 }),
      );
      const label = makeLabelSprite(`#${i + 1} ${data.id}`);
      label.position.y = 0.8;
      group.add(core, hit, line, label);
      this.scene.add(group);
      this.markers.push({ data, group, core, hit, line, label });
    });
    this.refreshMarkerStates();
  }

  private updateMarkerTransform(h: HotspotData): void {
    const m = this.markers.find((mk) => mk.data === h);
    if (!m) return;
    m.group.position.set(h.position[0], h.position[1], h.position[2]);
    m.line.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -h.position[1], 0)]);
    if (h.id === this.selectedId) {
      const canvasLabel = `#${this.level.hotspots.indexOf(h) + 1} ${h.id}`;
      // 重建标签(编号可能变化)
      m.label.material.map?.dispose();
      m.label.material.dispose();
      const fresh = makeLabelSprite(canvasLabel);
      fresh.position.y = 0.8;
      m.group.remove(m.label);
      m.group.add(fresh);
      m.label = fresh;
    }
  }

  private refreshMarkerStates(): void {
    for (const m of this.markers) {
      const selected = m.data.id === this.selectedId;
      const color = selected ? 0xffd769 : 0x6fd3ff;
      m.core.material.color.setHex(color);
      m.core.material.emissive.setHex(color);
      m.core.scale.setScalar(selected ? 1.5 : 1);
      m.line.material.color.setHex(color);
    }
  }

  /** 出生点标记:绿色球 + 朝向箭头。 */
  private refreshSpawnMarker(): void {
    for (const child of [...this.spawnGroup.children]) {
      this.spawnGroup.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }
    const [x, y, z] = this.level.spawn.position;
    const dirX = -Math.sin(THREE.MathUtils.degToRad(this.level.spawn.yawDeg));
    const dirZ = -Math.cos(THREE.MathUtils.degToRad(this.level.spawn.yawDeg));
    const mat = new THREE.MeshBasicMaterial({ color: 0x58e07d });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat);
    ball.position.set(x, y + 1.65, z);
    const arrowGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y + 1.65, z),
      new THREE.Vector3(x + dirX * 2.5, y + 1.65, z + dirZ * 2.5),
    ]);
    const arrow = new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0x58e07d }));
    this.spawnGroup.add(ball, arrow);
  }

  // —————————————————————— 输入 ——————————————————————

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return; // 表单输入中不触发编辑器快捷键
    }
    if (e.key === 'Escape') return; // Esc 交给浏览器解锁指针
    this.keys.add(e.code);
    if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      this.deleteSelected();
      return;
    }
    if (e.code === 'BracketLeft') this.cycleSelection(-1);
    if (e.code === 'BracketRight') this.cycleSelection(1);
    if (e.code === 'KeyF' && document.pointerLockElement === this.canvas) this.teleportToAim();
    const step = e.shiftKey ? NUDGE_STEP * 4 : NUDGE_STEP;
    if (e.code === 'ArrowLeft') { e.preventDefault(); this.nudgeSelected(-step, 0, 0); }
    if (e.code === 'ArrowRight') { e.preventDefault(); this.nudgeSelected(step, 0, 0); }
    if (e.code === 'ArrowUp') { e.preventDefault(); this.nudgeSelected(0, 0, -step); }
    if (e.code === 'ArrowDown') { e.preventDefault(); this.nudgeSelected(0, 0, step); }
    if (e.code === 'PageUp') { e.preventDefault(); this.nudgeSelected(0, step, 0); }
    if (e.code === 'PageDown') { e.preventDefault(); this.nudgeSelected(0, -step, 0); }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly clearKeys = (): void => {
    this.keys.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.applyCamera();
  };

  private requestLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }

  private readonly onResize = (): void => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.clearKeys);
    this.panel.dispose();
    this.asset.dispose();
    this.helpEl.remove();
    for (const child of [...this.scene.children]) this.scene.remove(child);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
