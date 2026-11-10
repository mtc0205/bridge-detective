/**
 * HUD(原生 DOM):准星、案件名、已标记 n/总数、计时条、分数、交互提示、反馈 toast。
 */

export type ToastTone = 'good' | 'bad' | 'info';

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly caseNameEl: HTMLElement;
  private readonly progressEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly timerFill: HTMLElement;
  private readonly timerText: HTMLElement;
  private readonly timerWrap: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly crosshairEl: HTMLElement;
  private readonly toastsEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    this.root.innerHTML = '';

    const top = el('div', 'hud-top');
    const caseBox = el('div', 'hud-case');
    this.caseNameEl = el('span', 'hud-case-name');
    this.progressEl = el('span', 'hud-progress', '0/0');
    caseBox.append(this.caseNameEl, this.progressEl);

    this.timerWrap = el('div', 'hud-timer');
    this.timerFill = el('div', 'hud-timer-fill');
    this.timerText = el('span', 'hud-timer-text', '--:--');
    this.timerWrap.append(this.timerFill, this.timerText);

    const scoreBox = el('div', 'hud-score');
    scoreBox.append(el('span', 'hud-score-label', '得分'), (this.scoreEl = el('span', 'hud-score-num', '0')));

    top.append(caseBox, this.timerWrap, scoreBox);

    this.crosshairEl = el('div', 'crosshair');
    this.crosshairEl.append(el('div', 'cross-dot'), el('div', 'cross-ring'));

    this.promptEl = el('div', 'prompt hidden');
    this.toastsEl = el('div', 'toasts');

    this.root.append(top, this.crosshairEl, this.promptEl, this.toastsEl);
    parent.append(this.root);
  }

  setCase(name: string): void {
    this.caseNameEl.textContent = name;
  }

  setProgress(done: number, total: number): void {
    this.progressEl.textContent = `${done}/${total}`;
  }

  setScore(score: number): void {
    this.scoreEl.textContent = String(score);
  }

  setTime(leftSec: number, totalSec: number): void {
    const ratio = totalSec > 0 ? Math.max(0, Math.min(1, leftSec / totalSec)) : 0;
    this.timerFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    this.timerText.textContent = formatTime(leftSec);
    this.timerWrap.classList.toggle('urgent', ratio < 0.25);
  }

  /** 准星附近可交互时的高亮提示文案;null 隐藏。 */
  setPrompt(text: string | null): void {
    if (text === null) {
      this.promptEl.classList.add('hidden');
      this.promptEl.textContent = '';
    } else {
      this.promptEl.classList.remove('hidden');
      this.promptEl.textContent = text;
    }
  }

  /** 准星命中状态(放大 + 变色)。 */
  setAim(active: boolean): void {
    this.crosshairEl.classList.toggle('aim', active);
  }

  toast(text: string, tone: ToastTone = 'info'): void {
    const t = el('div', `toast toast-${tone}`, text);
    this.toastsEl.append(t);
    // 入场动画 + 定时移除
    requestAnimationFrame(() => t.classList.add('show'));
    window.setTimeout(() => {
      t.classList.remove('show');
      window.setTimeout(() => t.remove(), 350);
    }, 2400);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  dispose(): void {
    this.root.remove();
  }
}
