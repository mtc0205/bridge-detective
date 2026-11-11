/**
 * 结算页(原生 DOM):评级翻牌 + 三部件 BCI + 成绩统计 + 漏检清单 + 报告入口。
 *
 * M1:BCI 按桥面系/上部/下部分部件展示;漏检条目标注实际缺陷;
 * 「查看检测报告」由 Game 注入回调打开 ReportView(可下载 Markdown / 打印 PDF)。
 * 漏检回放按钮(场景内高亮)由 Game 在存在漏检时启用。
 */

import { GRADE_LABELS } from '../game/bci';

export interface SettlementStats {
  caseName: string;
  caseId: string;
  endReason: 'time' | 'done';
  score: number;
  resolvedCount: number;
  total: number;
  correct: number;
  partial: number;
  wrong: number;
  falsePositive: number;
  missed: { id: string; label: string; truthText: string }[];
  bci: number;
  componentBci: { deck: number; superstructure: number; substructure: number };
  criticalTrigger: string | null;
  grade: 1 | 2 | 3 | 4 | 5;
  timeUsedSec: number;
  timeLimitSec: number;
  markdown: string;
}

export interface SettlementCallbacks {
  onRestart: () => void;
  onExit: () => void;
  onShowReport: () => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function el(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export class SettlementView {
  private readonly backdrop: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly reasonEl: HTMLElement;
  private readonly gradeNumEl: HTMLElement;
  private readonly gradeTextEl: HTMLElement;
  private readonly bciEl: HTMLElement;
  private readonly compDeck: HTMLElement;
  private readonly compSup: HTMLElement;
  private readonly compSub: HTMLElement;
  private readonly criticalEl: HTMLElement;
  private readonly statScore: HTMLElement;
  private readonly statCorrect: HTMLElement;
  private readonly statPartial: HTMLElement;
  private readonly statFalsePositive: HTMLElement;
  private readonly statMissed: HTMLElement;
  private readonly statTime: HTMLElement;
  private readonly missedListEl: HTMLElement;
  private readonly reportBtn: HTMLButtonElement;
  private readonly replayBtn: HTMLButtonElement;
  private readonly epilogueOverlay: HTMLElement;

  private readonly callbacks: SettlementCallbacks;

  constructor(parent: HTMLElement, callbacks: SettlementCallbacks) {
    this.callbacks = callbacks;
    this.backdrop = el('div', 'settlement-backdrop hidden');

    const panel = el('div', 'settlement-panel');
    this.panelEl = panel;

    const header = el('header', 'settlement-header');
    const titleBox = el('div');
    const title = el('h2', '', '检测结束 · 技术状况评定');
    this.reasonEl = el('span', 'settlement-reason');
    titleBox.append(title, this.reasonEl);

    // 评级区
    const gradeBox = el('div', 'grade-card');
    this.gradeNumEl = el('div', 'grade-num');
    this.gradeTextEl = el('div', 'grade-text');
    const bciLabel = el('span', 'grade-bci-label', '整体 BCI');
    this.bciEl = el('div', 'grade-bci');
    const bciBox = el('div', 'grade-bci-box');
    bciBox.append(bciLabel, this.bciEl);
    gradeBox.append(this.gradeNumEl, this.gradeTextEl, bciBox);

    // 分部件 BCI + 关键条款
    const compBox = el('div', 'comp-row');
    const mkComp = (label: string): { item: HTMLElement; value: HTMLElement } => {
      const item = el('div', 'comp-item');
      const value = el('b', 'comp-value');
      item.append(el('span', 'comp-label', label), value);
      compBox.append(item);
      return { item, value };
    };
    this.compDeck = mkComp('桥面系').value;
    this.compSup = mkComp('上部结构').value;
    this.compSub = mkComp('下部结构').value;
    this.criticalEl = el('p', 'critical-note hidden');

    // 统计
    const stats = el('div', 'settlement-stats');
    const stat = (label: string): HTMLElement => {
      const item = el('div', 'stat-item');
      const l = el('span', '', label);
      const v = el('b');
      item.append(l, v);
      stats.append(item);
      return v;
    };
    this.statScore = stat('总得分');
    this.statCorrect = stat('判定正确');
    this.statPartial = stat('严重度偏差');
    this.statFalsePositive = stat('误报');
    this.statMissed = stat('漏检');
    this.statTime = stat('用时');

    // 漏检清单
    const missedBox = el('div', 'missed-box');
    const missedTitle = el('span', 'missed-title', '漏检清单(可回放定位)');
    this.missedListEl = el('div', 'missed-list');
    missedBox.append(missedTitle, this.missedListEl);

    // 操作
    const actions = el('div', 'settlement-actions');
    this.reportBtn = el('button', 'btn primary') as HTMLButtonElement;
    this.reportBtn.textContent = '查看检测报告';
    this.reportBtn.addEventListener('click', () => this.callbacks.onShowReport());
    this.replayBtn = el('button', 'btn') as HTMLButtonElement;
    this.replayBtn.textContent = '漏检回放';
    const epilogueBtn = el('button', 'btn') as HTMLButtonElement;
    epilogueBtn.textContent = '尾声 · 此桥必复';
    epilogueBtn.classList.add('hidden');
    const restartBtn = el('button', 'btn') as HTMLButtonElement;
    restartBtn.textContent = '再测一次';
    restartBtn.addEventListener('click', () => {
      this.hide();
      callbacks.onRestart();
    });
    const exitBtn = el('button', 'btn ghost') as HTMLButtonElement;
    exitBtn.textContent = '返回案件选择';
    exitBtn.addEventListener('click', () => {
      this.hide();
      callbacks.onExit();
    });
    actions.append(this.reportBtn, this.replayBtn, epilogueBtn, restartBtn, exitBtn);

    // 尾声卡(旗舰案件的历史后日谈;由 Game 注入文案)
    this.epilogueOverlay = el('div', 'epilogue-backdrop hidden');
    this.epilogueOverlay.addEventListener('click', (e) => {
      if (e.target === this.epilogueOverlay) this.epilogueOverlay.classList.add('hidden');
    });
    const epiCard = el('div', 'epilogue-card');
    const epiTag = el('span', 'epilogue-tag', 'EPILOGUE · 尾声');
    const epiTitle = el('h2', '', '此桥必复');
    const epiText = el('p', 'epilogue-text');
    const epiClose = el('button', 'btn primary') as HTMLButtonElement;
    epiClose.textContent = '合上档案';
    epiClose.addEventListener('click', () => this.epilogueOverlay.classList.add('hidden'));
    epiCard.append(epiTag, epiTitle, epiText, epiClose);
    this.epilogueOverlay.append(epiCard);
    epilogueBtn.addEventListener('click', () => this.epilogueOverlay.classList.remove('hidden'));
    this.epilogueTextEl = epiText;
    this.epilogueBtn = epilogueBtn;

    header.append(titleBox);
    panel.append(header, gradeBox, compBox, this.criticalEl, stats, missedBox, actions);
    this.backdrop.append(panel);
    parent.append(this.backdrop, this.epilogueOverlay);
  }

  private readonly epilogueTextEl: HTMLElement;
  private readonly epilogueBtn: HTMLButtonElement;

  /** 注入尾声文案(无则隐藏按钮;教学关 / 案件二不显示)。 */
  setEpilogue(text: string | null): void {
    this.epilogueTextEl.textContent = text ?? '';
    this.epilogueBtn.classList.toggle('hidden', !text);
  }

  /** 设置漏检回放回调(Game 注入;无漏检时按钮隐藏)。 */
  setReplayHandler(handler: (() => void) | null): void {
    this.replayBtn.onclick = handler ? () => handler() : null;
    this.replayBtn.classList.toggle('hidden', handler === null);
  }

  show(stats: SettlementStats): void {
    this.reasonEl.textContent =
      stats.endReason === 'time' ? `时间到 · ${stats.caseName}` : `全部检测点已处理 · ${stats.caseName}`;
    this.gradeNumEl.textContent = String(stats.grade);
    this.gradeTextEl.textContent = GRADE_LABELS[stats.grade];
    this.gradeNumEl.dataset.grade = String(stats.grade);
    this.animateBci(stats.bci);
    // 结算入场动画(雏形):重置 class 强制重播 CSS 关键帧
    this.panelEl.classList.remove('animate');
    void this.panelEl.offsetWidth; // 强制 reflow
    this.panelEl.classList.add('animate');
    this.compDeck.textContent = stats.componentBci.deck.toFixed(1);
    this.compSup.textContent = stats.componentBci.superstructure.toFixed(1);
    this.compSub.textContent = stats.componentBci.substructure.toFixed(1);
    this.criticalEl.classList.toggle('hidden', !stats.criticalTrigger);
    if (stats.criticalTrigger) {
      this.criticalEl.textContent =
        '⚠ 关键安全隐患条款:重级「支座脱空 / 构件断裂 / 拱圈砌石松动」→ BCI 上限 57(四类·不合格)';
    }
    this.statScore.textContent = String(stats.score);
    this.statCorrect.textContent = `${stats.correct}/${stats.total}`;
    this.statPartial.textContent = String(stats.partial);
    this.statFalsePositive.textContent = String(stats.falsePositive);
    this.statMissed.textContent = String(stats.missed.length);
    this.statTime.textContent = `${formatTime(stats.timeUsedSec)} / ${formatTime(stats.timeLimitSec)}`;

    this.missedListEl.replaceChildren();
    if (stats.missed.length === 0) {
      const none = el('span', 'missed-none', '无漏检,检测记录完整。');
      this.missedListEl.append(none);
    } else {
      for (const m of stats.missed) {
        const chip = el('span', 'missed-chip');
        chip.textContent = `${m.label} · 实际:${m.truthText}`;
        this.missedListEl.append(chip);
      }
    }

    this.backdrop.classList.remove('hidden');
  }

  hide(): void {
    this.backdrop.classList.add('hidden');
  }

  /** BCI 数字滚动(从 100 评到实际值,先抑后扬的「翻账」感)。 */
  private animateBci(target: number): void {
    const startVal = 100;
    const durationMs = 900;
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      this.bciEl.textContent = (startVal + (target - startVal) * eased).toFixed(1);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  dispose(): void {
    this.backdrop.remove();
  }
}
