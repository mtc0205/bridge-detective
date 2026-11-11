/**
 * Game:一局游戏的编排器(Three.js 装配 + 状态机)。
 *
 * 状态机:ready → playing ⇄ paused / dialog / codex → ended
 *  - ready:开场卡(案情简介 + 操作说明),点击进入并锁定指针;
 *  - playing:控制器 / 热点 / 计时驱动;
 *  - paused:Esc 或指针解锁,点击继续;
 *  - dialog:检测弹窗打开(计时暂停);
 *  - codex:图鉴覆盖层(从 playing 或 dialog 打开,计时暂停);
 *  - ended:时间到或全部处理完 → 结算页 → 检测报告(下载 / 打印)。
 */

import * as THREE from 'three';
import type { LevelAsset, LevelAssetFactory } from '../bridge/levelAsset';
import { PlayerController } from '../player/controller';
import { HotspotSystem } from '../gameplay/hotspot';
import { Session } from './session';
import { DEFECT_TYPES, DEFECT_TYPE_LABELS, SEVERITY_LABELS } from './level';
import type { HotspotData, LevelData } from './level';
import { Hud } from '../ui/hud';
import { InspectDialog } from '../ui/inspectDialog';
import type { DialogFeedback } from '../ui/inspectDialog';
import { SettlementView } from '../ui/settlement';
import type { SettlementStats } from '../ui/settlement';
import { CodexView } from '../ui/codexView';
import { ReportView } from '../ui/reportView';
import type { ReportStats } from '../ui/reportView';
import { Sfx } from '../audio/sfx';
import { atmosphereValues, presetForLevel, URGENT_SECONDS } from './atmosphere';
import type { AtmospherePreset } from './atmosphere';

export interface GameHooks {
  /** 返回案件选择页 */
  onExit: () => void;
  /** 再测一次(重建 Game) */
  onRestart: () => void;
}

type GameState = 'ready' | 'playing' | 'paused' | 'dialog' | 'codex' | 'ended' | 'replay';

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
  private readonly codex: CodexView;
  private readonly report: ReportView;
  private readonly session: Session;
  private readonly sfx = new Sfx();
  private readonly canvas: HTMLCanvasElement;
  private readonly clock = new THREE.Clock();
  /** 日落倒计时光影:场景灯光捕获 + 全屏色罩 */
  private readonly atmoPreset: AtmospherePreset;
  private readonly duskOverlay: HTMLElement;
  private atmoSun: THREE.DirectionalLight | null = null;
  private atmoHemi: THREE.HemisphereLight | null = null;
  private atmoLastSec = -1;
  private urgentNotified = false;
  private readonly startOverlay: HTMLElement;
  private readonly pauseOverlay: HTMLElement;
  private readonly replayBar: HTMLElement;
  private readonly replayLabelEl: HTMLElement;
  private readonly guideEl: HTMLElement;
  /** 首次近热点引导(浏览器本地记一次,非打断式) */
  private guideDone: boolean;

  private state: GameState = 'ready';
  private elapsed = 0;
  private activeHotspot: HotspotData | null = null;
  private disposed = false;
  /** 打开图鉴前的状态(playing → 恢复游玩;dialog → 回到弹窗) */
  private codexReturnState: 'playing' | 'dialog' | null = null;
  private lastStats: SettlementStats | null = null;
  /** 漏检回放目标与当前下标 */
  private replayTargets: HotspotData[] = [];
  private replayIndex = 0;

  constructor(host: HTMLElement, level: LevelData, assetFactory: LevelAssetFactory, hooks: GameHooks) {
    this.host = host;
    this.level = level;
    this.hooks = hooks;

    // —— 资产(程序桥 / M2 换 Lux3D)——
    this.asset = assetFactory(level);
    this.asset.decorateScene(this.scene);
    this.scene.add(this.asset.root);

    // —— 日落倒计时光影:捕获资产布置的灯光,叠加全屏色罩 ——
    this.atmoPreset = presetForLevel(level.id);
    for (const light of this.scene.children) {
      if (light instanceof THREE.DirectionalLight && !this.atmoSun) this.atmoSun = light;
      else if (light instanceof THREE.HemisphereLight && !this.atmoHemi) this.atmoHemi = light;
    }
    this.duskOverlay = document.createElement('div');
    this.duskOverlay.className = 'dusk-overlay';
    this.host.append(this.duskOverlay);
    this.applyAtmosphere(0);

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
    this.dialog = new InspectDialog(this.host, {
      types: level.defectTypes ?? DEFECT_TYPES,
      onOpenCodex: () => this.openCodex('dialog'),
    });
    this.settlement = new SettlementView(this.host, {
      onRestart: hooks.onRestart,
      onExit: hooks.onExit,
      onShowReport: () => {
        if (this.lastStats) this.report.show(this.buildReportStats());
      },
    });
    this.settlement.setEpilogue(level.epilogue ?? null);
    this.codex = new CodexView(this.host);
    this.codex.onClose = () => this.onCodexClosed();
    this.report = new ReportView(this.host, () => this.report.hide());

    // —— 开场卡 / 暂停层 / 回放条 / 首次引导 ——
    this.startOverlay = this.buildStartOverlay();
    this.pauseOverlay = this.buildPauseOverlay();
    const bar = this.buildReplayBar();
    this.replayBar = bar.root;
    this.replayLabelEl = bar.label;
    this.guideEl = this.buildGuideTip();
    this.guideDone = Game.guideFlagRead();

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
    if (this.state === 'playing' || this.state === 'replay') {
      this.elapsed += dt;
      this.controller.update(dt);
      const aimed = this.hotspots.update(this.controller.camera, this.elapsed, dt);
      if (this.state === 'playing') {
        this.activeHotspot = aimed;
        this.hud.setAim(aimed !== null);
        this.hud.setPrompt(aimed ? `E · 检测:${aimed.label}` : null);
        if (aimed && !this.guideDone) this.showGuideOnce();

        this.session.tick(dt);
        this.hud.setTime(this.session.timeLeft, this.level.timeLimitSec);
        this.updateAtmosphere();
        if (this.session.timeUp) {
          this.endGame('time');
        }
      }
    } else {
      // 非游玩状态仍驱动标记动效(画面保持活性)
      this.hotspots.update(this.controller.camera, this.elapsed, dt);
    }
    this.asset.update(this.elapsed, dt);
    this.renderer.render(this.scene, this.controller.camera);
  };

  // —————————————————————— 交互 ——————————————————————

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    // 音效开关在所有状态生效(含弹窗 / 图鉴 / 回放)
    if (e.code === 'KeyM' && !e.repeat) {
      const muted = this.sfx.toggleMute();
      this.hud.toast(muted ? '音效:关(M 再开)' : '音效:开', 'info');
    }
    if (this.state === 'replay') {
      if (e.code === 'KeyN' && !e.repeat) this.replayStep(1);
      else if (e.code === 'KeyP' && !e.repeat) this.replayStep(-1);
      else if (e.key === 'Escape') this.exitReplay();
      return;
    }
    if (e.code === 'KeyE' && !e.repeat && this.state === 'playing' && this.activeHotspot) {
      e.preventDefault();
      void this.openInspect(this.activeHotspot);
    }
    if (e.code === 'KeyG' && !e.repeat && this.state === 'playing') {
      this.openCodex('playing');
    }
  };

  private async openInspect(hotspot: HotspotData): Promise<void> {
    this.sfx.open();
    this.guideEl.classList.remove('show'); // 首次引导见到 E 生效即收起
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
      if (ok) this.sfx.good();
      else this.sfx.bad();

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

  // —————————————————————— 日落倒计时光影 ——————————————————————

  /** 按秒节流地推进氛围插值;最后 60 秒进入紧迫提示。 */
  private updateAtmosphere(): void {
    const sec = Math.ceil(this.session.timeLeft);
    if (sec !== this.atmoLastSec) {
      this.atmoLastSec = sec;
      this.applyAtmosphere(1 - this.session.timeLeft / this.level.timeLimitSec);
    }
    if (!this.urgentNotified && this.session.timeLeft <= URGENT_SECONDS && !this.session.timeUp) {
      this.urgentNotified = true;
      this.duskOverlay.classList.add('urgent');
      this.hud.toast('距时限不足 1 分钟,抓紧收尾', 'bad');
      this.sfx.bad();
    }
  }

  private applyAtmosphere(k: number): void {
    const v = atmosphereValues(this.atmoPreset, k);
    if (this.atmoSun) {
      this.atmoSun.color.setHex(v.sunColor);
      this.atmoSun.intensity = v.sunIntensity;
    }
    if (this.atmoHemi) this.atmoHemi.intensity = v.hemiIntensity;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(v.fogColor);
      this.scene.fog.near = v.fogNear;
      this.scene.fog.far = v.fogFar;
    }
    this.duskOverlay.style.background = `rgb(${v.overlayRgb})`;
    this.duskOverlay.style.opacity = v.overlayOpacity.toFixed(3);
  }

  // —————————————————————— 图鉴 ——————————————————————
  private openCodex(from: 'playing' | 'dialog'): void {
    if (this.codex.visible) return;
    this.codexReturnState = from;
    if (from === 'playing') {
      this.state = 'codex';
      this.controller.enabled = false;
      this.hud.setPrompt(null);
      this.hud.setAim(false);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.codex.show();
  }

  private onCodexClosed(): void {
    if (this.disposed) return;
    if (this.codexReturnState === 'playing') {
      this.codexReturnState = null;
      this.resumeFromDialog(); // 复用:置 paused → 重锁指针 → 失败则暂停层
    } else {
      this.codexReturnState = null; // dialog:弹窗仍在,计时保持暂停
    }
  }

  /** 弹窗 / 图鉴关闭后恢复游玩(「收起」点击即用户手势,可直接重锁指针)。 */
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
    const stats = this.buildSettlementStats(reason);
    this.lastStats = stats;
    this.settlement.setReplayHandler(stats.missed.length > 0 ? () => this.enterReplay() : null);
    this.settlement.show(stats);
    this.sfx.settle();
  }

  // —————————————————————— 漏检回放 ——————————————————————

  /** 进入回放:漏检热点加红色光柱信标,逐个传送到观察位(WASD 可自由走动)。 */
  private enterReplay(): void {
    if (this.state !== 'ended') return;
    const targets = this.session.missedHotspots();
    if (targets.length === 0) return;
    this.replayTargets = targets;
    this.replayIndex = 0;
    this.settlement.hide();
    this.report.hide();
    this.hud.setVisible(false);
    this.state = 'replay';
    this.controller.enabled = true;
    this.hotspots.highlightMissed(targets.map((h) => h.id));
    this.focusReplayTarget();
    this.replayBar.classList.remove('hidden');
  }

  private focusReplayTarget(): void {
    const h = this.replayTargets[this.replayIndex];
    if (!h) return;
    this.controller.teleportToView(h.position[0], h.position[1], h.position[2]);
    const truth =
      h.answer.type === 'none'
        ? '—'
        : `${DEFECT_TYPE_LABELS[h.answer.type]}·${SEVERITY_LABELS[h.answer.severity]}`;
    this.replayLabelEl.textContent = `${this.replayIndex + 1}/${this.replayTargets.length} · ${h.label}(实际:${truth})`;
  }

  private replayStep(dir: 1 | -1): void {
    const n = this.replayTargets.length;
    if (n === 0) return;
    this.replayIndex = (this.replayIndex + dir + n) % n;
    this.focusReplayTarget();
  }

  private exitReplay(): void {
    if (this.state !== 'replay') return;
    this.state = 'ended';
    this.controller.enabled = false;
    this.replayBar.classList.add('hidden');
    this.hotspots.highlightMissed([]); // 清除信标
    if (this.lastStats) this.settlement.show(this.lastStats);
  }

  /** 结算页数据(与报告数据同源自 session,保证数字一致)。 */
  private buildSettlementStats(reason: 'time' | 'done'): SettlementStats {
    const s = this.session;
    const bci = s.bciResult;
    return {
      caseName: this.level.caseName,
      caseId: this.level.id,
      endReason: reason,
      score: s.score,
      resolvedCount: s.resolvedCount,
      total: this.level.hotspots.length,
      correct: s.counts.correct,
      partial: s.counts.partial,
      wrong: s.counts.wrong,
      falsePositive: s.counts.falsePositive,
      missed: s.missedHotspots().map((h) => ({
        id: h.id,
        label: h.label,
        truthText:
          h.answer.type === 'none'
            ? '—'
            : `${DEFECT_TYPE_LABELS[h.answer.type]}·${SEVERITY_LABELS[h.answer.severity]}`,
      })),
      bci: bci.overall,
      componentBci: {
        deck: bci.deck,
        superstructure: bci.superstructure,
        substructure: bci.substructure,
      },
      criticalTrigger: bci.criticalTrigger,
      grade: s.grade,
      timeUsedSec: s.elapsedSec,
      timeLimitSec: this.level.timeLimitSec,
      markdown: s.buildReportMarkdown(),
    };
  }

  /** 报告页数据(HTML 报告与 Markdown 同源)。 */
  private buildReportStats(): ReportStats {
    const s = this.session;
    const bci = s.bciResult;
    const counts = s.counts;
    const missed = s.missedHotspots();
    const fps = s.falsePositives();
    const missedText =
      missed.length === 0
        ? '无漏检,检测记录完整。'
        : `漏检 ${missed.length} 处:${missed
            .map((h) =>
              h.answer.type === 'none'
                ? h.label
                : `${h.label}(实际:${DEFECT_TYPE_LABELS[h.answer.type]}·${SEVERITY_LABELS[h.answer.severity]})`,
            )
            .join(';')}。`;
    const falsePositiveText =
      fps.length === 0 ? '' : `误报 ${fps.length} 处:${fps.map((r) => r.label).join(';')}。`;
    const qualityText = `判定正确 ${counts.correct} / 严重度偏差 ${counts.partial} / 误判 ${counts.wrong} / 误报 ${counts.falsePositive} / 漏检 ${counts.missed};总得分 ${s.score}。`;
    return {
      caseId: this.level.id,
      caseName: this.level.caseName,
      subtitle: this.level.subtitle,
      grade: s.grade,
      componentBci: { deck: bci.deck, superstructure: bci.superstructure, substructure: bci.substructure },
      overallBci: bci.overall,
      criticalTrigger: bci.criticalTrigger,
      groundTruthBci: s.groundTruthBci,
      timeUsedSec: s.elapsedSec,
      timeLimitSec: this.level.timeLimitSec,
      rows: s.reportRows(),
      missedText,
      falsePositiveText,
      qualityText,
      markdown: s.buildReportMarkdown(),
    };
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
      '<span><b>G</b> 判定图鉴</span><span><b>M</b> 音效开关</span><span><b>Shift</b> 加速</span>' +
      '<span><b>Esc</b> 暂停 / 释放指针</span>';
    const tip = document.createElement('p');
    tip.className = 'start-tip';
    tip.textContent = '路线提示:沿桥面从西端走到东端下路堤,再从桥南侧绕到桥下便道,仰头检查梁体与支座。';
    const enterBtn = document.createElement('button');
    enterBtn.className = 'btn primary lg';
    enterBtn.textContent = '进入检测现场';
    enterBtn.addEventListener('click', () => {
      this.startOverlay.classList.add('hidden');
      this.sfx.startWind(); // 用户手势后起环境风
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

  /** 首次近热点的非打断式引导条(按键链,一次即不再出现)。 */
  private buildGuideTip(): HTMLElement {
    const tip = document.createElement('div');
    tip.className = 'guide-tip';
    const steps: [string, string][] = [
      ['WASD', '走近微光标记'],
      ['E', '打开近景检测'],
      ['类型 + 轻中重', '选判定'],
      ['Enter', '提交 · G 图鉴'],
    ];
    steps.forEach(([key, label], i) => {
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'guide-arrow';
        arrow.textContent = '→';
        tip.append(arrow);
      }
      const box = document.createElement('span');
      box.className = 'guide-step';
      const k = document.createElement('b');
      k.textContent = key;
      const l = document.createElement('span');
      l.textContent = label;
      box.append(k, l);
      tip.append(box);
    });
    this.host.append(tip);
    return tip;
  }

  private showGuideOnce(): void {
    this.guideDone = true;
    Game.guideFlagWrite();
    this.guideEl.classList.add('show');
    window.setTimeout(() => {
      if (!this.disposed) this.guideEl.classList.remove('show');
    }, 10000);
  }

  private static guideFlagRead(): boolean {
    try {
      return window.localStorage.getItem('bd-guide-v1') !== null;
    } catch {
      return false; // 隐私模式:降级为每局一次
    }
  }

  private static guideFlagWrite(): void {
    try {
      window.localStorage.setItem('bd-guide-v1', '1');
    } catch {
      /* 忽略 */
    }
  }

  /** 漏检回放底部切换条(N/P 键与按钮等价)。 */
  private buildReplayBar(): { root: HTMLElement; label: HTMLElement } {    const bar = document.createElement('div');
    bar.className = 'replay-bar hidden';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn small';
    prevBtn.textContent = '◀ 上一处 (P)';
    prevBtn.addEventListener('click', () => this.replayStep(-1));
    const label = document.createElement('span');
    label.className = 'replay-label';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn small';
    nextBtn.textContent = '下一处 (N) ▶';
    nextBtn.addEventListener('click', () => this.replayStep(1));
    const exitBtn = document.createElement('button');
    exitBtn.className = 'btn small ghost';
    exitBtn.textContent = '结束回放';
    exitBtn.addEventListener('click', () => this.exitReplay());
    const hint = document.createElement('span');
    hint.className = 'replay-hint';
    hint.textContent = '红色光柱 = 漏检位置 · WASD 自由走动复盘';
    bar.append(prevBtn, label, nextBtn, exitBtn, hint);
    this.host.append(bar);
    return { root: bar, label };
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
    this.codex.dispose();
    this.report.dispose();
    this.settlement.dispose();
    this.sfx.dispose();
    this.startOverlay.remove();
    this.pauseOverlay.remove();
    this.replayBar.remove();
    this.duskOverlay.remove();
    this.guideEl.remove();
    for (const child of [...this.scene.children]) this.scene.remove(child);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
