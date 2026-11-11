/**
 * 检测图鉴(原生 DOM 覆盖层):判定规则随查。
 *
 * 按 G 或弹窗内「图鉴」按钮打开;分组展示 16 类缺陷的观察要点、
 * 严重度分级规则(JTG/T H21-2011 简化)、BCI 权重与处治建议。
 * 打开时游戏计时暂停(由 Game 状态机保证)。
 */

import { CODEX, CODEX_FOOTNOTE, CODEX_GROUPS } from '../game/codex';
import { BCI_TYPE_WEIGHT } from '../game/bci';
import { DEFECT_TYPE_LABELS } from '../game/level';
import type { DefectType } from '../game/level';

export class CodexView {
  private readonly backdrop: HTMLElement;
  /** 关闭回调(Game 据此恢复游玩 / 保持弹窗)。 */
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'codex-backdrop hidden';
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.hide();
    });

    const panel = document.createElement('div');
    panel.className = 'codex-panel';

    const header = document.createElement('header');
    header.className = 'codex-header';
    const titleBox = document.createElement('div');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'codex-eyebrow';
    eyebrow.textContent = 'JTG/T H21-2011 · 教学简化';
    const title = document.createElement('h2');
    title.textContent = '检测图鉴 · 判定规则';
    titleBox.append(eyebrow, title);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', '关闭图鉴');
    closeBtn.addEventListener('click', () => this.hide());
    header.append(titleBox, closeBtn);

    const list = document.createElement('div');
    list.className = 'codex-list';
    for (const group of CODEX_GROUPS) {
      const groupEl = document.createElement('section');
      groupEl.className = 'codex-group';
      const groupTitle = document.createElement('h3');
      groupTitle.textContent = group.title;
      groupEl.append(groupTitle);
      for (const t of group.types) groupEl.append(CodexView.buildCard(t));
      list.append(groupEl);
    }

    const footnote = document.createElement('p');
    footnote.className = 'codex-footnote';
    footnote.textContent = CODEX_FOOTNOTE;

    panel.append(header, list, footnote);
    this.backdrop.append(panel);
    parent.append(this.backdrop);

    // 捕获阶段监听:图鉴置顶时(如覆盖检测弹窗),Esc/G 不再下传给弹窗
    document.addEventListener('keydown', this.onKeydown, true);
  }

  private static buildCard(t: DefectType): HTMLElement {
    const entry = CODEX[t];
    const card = document.createElement('article');
    card.className = 'codex-card';
    const head = document.createElement('div');
    head.className = 'codex-card-head';
    const name = document.createElement('b');
    name.textContent = DEFECT_TYPE_LABELS[t];
    const weight = document.createElement('span');
    weight.className = 'codex-weight';
    weight.textContent = `BCI 权重 ${BCI_TYPE_WEIGHT[t]}`;
    head.append(name, weight);

    const identify = document.createElement('p');
    identify.innerHTML = `<i>观察</i>${entry.identify}`;
    const rule = document.createElement('p');
    rule.innerHTML = `<i>分级</i>${entry.severityRule}`;

    const repairs = document.createElement('div');
    repairs.className = 'codex-repairs';
    const rlight = document.createElement('span');
    rlight.innerHTML = `<em>轻</em>${entry.repairs.light}`;
    const rmed = document.createElement('span');
    rmed.innerHTML = `<em>中</em>${entry.repairs.medium}`;
    const rsev = document.createElement('span');
    rsev.innerHTML = `<em>重</em>${entry.repairs.severe}`;
    repairs.append(rlight, rmed, rsev);

    card.append(head, identify, rule, repairs);
    return card;
  }

  get visible(): boolean {
    return !this.backdrop.classList.contains('hidden');
  }

  show(): void {
    this.backdrop.classList.remove('hidden');
  }

  hide(): void {
    if (this.backdrop.classList.contains('hidden')) return;
    this.backdrop.classList.add('hidden');
    this.onClose?.();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeydown, true);
    this.backdrop.remove();
  }

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (this.backdrop.classList.contains('hidden')) return;
    if (e.key === 'Escape' || e.code === 'KeyG') {
      e.stopPropagation();
      this.hide();
    }
  };
}
