/**
 * Game:一局游戏的编排器(Three.js 装配 + 状态机)。
 *
 * 状态机:ready → playing ⇄ paused / dialog → ended
 *  - ready:开场卡(案情简介 + 操作说明),点击进入并锁定指针;
 *  - playing:控制器 / 热点 / 计时驱动;
 *  - paused:Esc 或指针解锁,点击继续;
 *  - dialog:检测弹窗打开(计时暂停);
 *  - ended:时间到或全部处理完 → 结算页。
 */

import * as THREE from 'three';
import type { LevelAsset, LevelAssetFactory } from '../bridge/levelAsset';
import { PlayerController } from '../player/controller';
import { HotspotSystem } from '../gameplay/hotspot';
import { Session } from './session';
import { Hud } from '../ui/hud';
import { InspectDialog } from '../ui/inspectDialog';
import type { DialogFeedback } from '../ui/inspectDialog';
import { SettlementView } from '../ui/settlement';
import type { HotspotData, LevelData } from './level';

export interface GameHooks {
  /** 返回案件选择页 */
  onExit: () => void;
  /** 再测一次(重建 Game) */
  onRestart: () => void;
}

type GameState = 'ready' | 'playing' | 'paused' | 'dialog' | 'ended';

export class Game {
  private readonly host: HTMLElement;
  private readonly level: LevelData;
  private readonly hooks: GameHooks;
  private readonly asset: LevelAsset;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly controller: PlayerController;
  private readonly hotspots: HotspotSystem;
  private readonly hud: Hud;
  private readonly dialog: InspectDialog;
  private readonly settlement: SettlementView;
  private readonly session: Session;
  private readonly canvas: HTMLCanvasElement;
  private readonly clock = new THREE.Clock();
  private readonly startOverlay: HTMLElement;
  private readonly pauseOverlay: HTMLElement;

  private state: GameState = 'ready';
  private elapsed = 0;
  private activeHotspot: HotspotData | null = null;
  private disposed = false;

  constructor(host: HTMLElement, level: LevelData, assetFactory: LevelAssetFactory, hooks: GameHooks) {
    this.host = host;
    this.level = level;
    this.hooks = hooks;

    // —— 资产(程序桥 / M2 换 Lux3D)——
    this.asset = assetFactory(level);
    this.asset.decorateScene(this.scene);
    this.scene.add(this.asset.root);

    // —— 渲染器 ——
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    this.host.append(this.canvas);

    // —— 控制器 & 热点 ——
    this.controller = new PlayerController(this.canvas, this.asset);
    this.hotspots = new HotspotSystem(this.scene, level.hotspots);

    // —— UI ——
    this.hud = new Hud(this.host);
    this.hud.setCase(level.caseName);
    this.hud.setProgress(0, level.hotspots.length);
    this.hud.setTime(level.timeLimitSec, level.timeLimitSec);
    this.hud.setVisible(false);
    this.dialog = new InspectDialog(this.host);
    this.settlement = new SettlementView(this.host, {
      onRestart: hooks.onRestart,
      onExit: hooks.onExit,
    });

    // —— 开场卡 / 暂停层 ——
    this.startOverlay = this.buildStartOverlay();
    this.pauseOverlay = this.buildPauseOverlay();

    // —— 事件 ——
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    window.addEventListener('keydown', this.onKeyDown);

    this.session = new Session(level);
    this.onResize();
  }

  /** 启动渲染循环(开场卡等待玩家点击)。 */
  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  // —————————————————————— 帧循环 ——————————————————————

  private readonly frame = (): void => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing') {
      this.elapsed += dt;
      this.controller.update(dt);
      this.activeHotspot = this.hotspots.update(this.controller.camera, this.elapsed, dt);
      this.hud.setAim(this.activeHotspot !== null);
      this.hud.setPrompt(this.activeHotspot ? `E · 检测:${this.activeHotspot.label}` : null);

      this.session.tick(dt);
      this.hud.setTime(this.session.timeLeft, this.level.timeLimitSec);
      if (this.session.timeUp) {
        this.endGame('time');
      }
    } else {
      // 非游玩状态仍驱动标记动效(画面保持活性)
      this.hotspots.update(this.controller.camera, this.elapsed, dt);
    }
    this.renderer.render(this.scene, this.controller.camera);
  };

  // —————————————————————— 交互 ——————————————————————

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    if (e.code === 'KeyE' && !e.repeat && this.state === 'playing' && this.activeHotspot) {
      e.preventDefault();
      void this.openInspect(this.activeHotspot);
    }
  };

  private async openInspect(hotspot: HotspotData): Promise<void> {
    this.state = 'dialog';
    this.controller.enabled = false;
    this.hud.setPrompt(null);
    this.hud.setAim(false);
    if (document.pointerLockElement) document.exitPointerLock();

    const choice = await this.dialog.open(hotspot);
    if (choice) {
      const resolution = this.session.resolve(hotspot, choice);
      this.hotspots.resolve(hotspot.id, resolution.judgment.kind);
      this.hud.setScore(this.session.score);
      this.hud.setProgress(this.session.resolvedCount, this.level.hotspots.length);
      const ok = resolution.judgment.scoreDelta > 0;
      this.hud.toast(`${resolution.judgment.heading} ${resolution.judgment.scoreDelta >= 0 ? '+' : ''}${resolution.judgment.scoreDelta}`, ok ? 'good' : 'bad');

      const feedback: DialogFeedback = {
        ok: resolution.judgment.kind === 'correct' || resolution.judgment.kind === 'decoyPass',
        heading: resolution.judgment.heading,
        detail: resolution.judgment.detail,
        normNote: hotspot.normNote,
        scoreText: `得分 ${resolution.judgment.scoreDelta >= 0 ? '+' : ''}${resolution.judgment.scoreDelta} · 总分 ${this.session.score}`,
      };
      this.dialog.showFeedback(feedback);
    }
    await this.dialog.closed;

    if (this.disposed) return;
    if (this.session.allResolved) {
      this.endGame('done');
      return;
    }
    this.resumeFromDialog();
  }

  /** 弹窗关闭后恢复游玩(「收起」点击即用户手势,可直接重锁指针)。 */
  private resumeFromDialog(): void {
    this.state = 'paused';
    this.pauseOverlay.classList.add('hidden');
    this.requestLock();
    // 个别浏览器拒绝无手势重锁:短暂延迟后兜底显示暂停层
    window.setTimeout(() => {
      if (!this.disposed && this.state === 'paused' && document.pointerLockElement !== this.canvas) {
        this.pauseOverlay.classList.remove('hidden');
      }
    }, 350);
  }

  private requestLock(): void {
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }

  private readonly onPointerLockChange = (): void => {
    if (this.disposed) return;
    const locked = document.pointerLockElement === this.canvas;
    if (locked && (this.state === 'paused' || this.state === 'ready')) {
      this.state = 'playing';
      this.controller.enabled = true;
      this.pauseOverlay.classList.add('hidden');
      this.startOverlay.classList.add('hidden');
      this.hud.setVisible(true);
    } else if (!locked && this.state === 'playing') {
      this.state = 'paused';
      this.controller.enabled = false;
      this.hud.setPrompt(null);
      this.pauseOverlay.classList.remove('hidden');
    }
  };

  private readonly onPointerLockError = (): void => {
    if (this.state === 'paused' || this.state === 'ready') {
      this.pauseOverlay.classList.remove('hidden');
    }
  };

  // —————————————————————— 结算 ——————————————————————

  private endGame(reason: 'time' | 'done'): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.controller.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.setPrompt(null);
    this.hud.setAim(false);
    const counts = this.session.counts;
    this.settlement.show({
      caseName: this.level.caseName,
      endReason: reason,
      score: this.session.score,
      resolvedCount: this.session.resolvedCount,
      total: this.level.hotspots.length,
      correct: counts.correct,
      partial: counts.partial,
      wrong: counts.wrong,
      falsePositive: counts.falsePositive,
      missed: this.session.missedHotspots().map((h) => ({ id: h.id, label: h.label })),
      bci: this.session.bci,
      grade: this.session.grade,
      timeUsedSec: this.session.elapsedSec,
      timeLimitSec: this.level.timeLimitSec,
      markdown: this.session.buildReportMarkdown(),
    });
  }

  // —————————————————————— 覆盖层 ——————————————————————

  private buildStartOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'start-backdrop';
    const card = document.createElement('div');
    card.className = 'start-card';
    const tag = document.createElement('span');
    tag.className = 'start-tag';
    tag.textContent = `案件档案 · ${this.level.subtitle}`;
    const title = document.createElement('h2');
    title.textContent = this.level.caseName;
    const brief = document.createElement('p');
    brief.className = 'start-brief';
    brief.textContent = this.level.brief;
    const brief2 = document.createElement('p');
    brief2.className = 'start-brief';
    brief2.textContent = `检测点 ${this.level.hotspots.length} 处 · 时限 ${Math.round(this.level.timeLimitSec / 60)} 分钟 · 全部处理完或时间到即结算。`;
    const controls = document.createElement('div');
    controls.className = 'start-controls';
    controls.innerHTML =
      '<span><b>WASD</b> 移动</span><span><b>鼠标</b> 视角</span><span><b>E</b> 检测</span>' +
      '<span><b>Shift</b> 加速</span><span><b>Esc</b> 暂停 / 释放指针</span>';
    const tip = document.createElement('p');
    tip.className = 'start-tip';
    tip.textContent = '路线提示:沿桥面从西端走到东端下路堤,再从桥南侧绕到桥下便道,仰头检查支座。';
    const enterBtn = document.createElement('button');
    enterBtn.className = 'btn primary lg';
    enterBtn.textContent = '进入检测现场';
    enterBtn.addEventListener('click', () => {
      this.startOverlay.classList.add('hidden');
      this.requestLock();
      // 指针锁定失败时由 onPointerLockError/兜底逻辑显示暂停层
      window.setTimeout(() => {
        if (!this.disposed && this.state === 'ready' && document.pointerLockElement !== this.canvas) {
          this.pauseOverlay.classList.remove('hidden');
        }
      }, 350);
    });
    card.append(tag, title, brief, brief2, controls, tip, enterBtn);
    overlay.append(card);
    this.host.append(overlay);
    return overlay;
  }

  private buildPauseOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'pause-backdrop hidden';
    const card = document.createElement('div');
    card.className = 'pause-card';
    const title = document.createElement('h3');
    title.textContent = '已暂停(Esc 已释放指针)';
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn primary';
    resumeBtn.textContent = '继续检测';
    resumeBtn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      this.requestLock();
    });
    const exitBtn = document.createElement('button');
    exitBtn.className = 'btn ghost';
    exitBtn.textContent = '返回案件选择';
    exitBtn.addEventListener('click', () => this.hooks.onExit());
    card.append(title, resumeBtn, exitBtn);
    overlay.append(card);
    this.host.append(overlay);
    return overlay;
  }

  // —————————————————————— 生命周期 ——————————————————————

  private readonly onResize = (): void => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.controller.resize(w, h);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    window.removeEventListener('keydown', this.onKeyDown);
    this.controller.dispose();
    this.hotspots.dispose(this.scene);
    this.asset.dispose();
    this.hud.dispose();
    this.dialog.dispose();
    this.settlement.dispose();
    this.startOverlay.remove();
    this.pauseOverlay.remove();
    for (const child of [...this.scene.children]) this.scene.remove(child);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
