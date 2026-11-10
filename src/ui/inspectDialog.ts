/**
 * 检测弹窗(原生 DOM):
 * 热点名称 + 近景描述(占位文案)→ 缺陷类型单选 × 7 + 严重度三选 → 提交即时反馈。
 *
 * 生命周期:
 *   open(hotspot) → 玩家选择 → resolve(InspectChoice | null)
 *   showFeedback(...) → 展示判定结果(正确/误报 + 规范依据)→「收起」→ closed Promise 结束
 */

import { DEFECT_TYPES, DEFECT_TYPE_LABELS, SEVERITIES, SEVERITY_LABELS } from '../game/level';
import type { DefectType, HotspotData, Severity } from '../game/level';
import type { InspectChoice } from '../game/scoring';

export interface DialogFeedback {
  ok: boolean;
  heading: string;
  detail: string;
  /** 规范依据(热点 normNote) */
  normNote: string;
  scoreText: string;
}

export class InspectDialog {
  private readonly backdrop: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private readonly typeGrid: HTMLElement;
  private readonly sevGrid: HTMLElement;
  private readonly submitBtn: HTMLButtonElement;
  private readonly noDefectBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly formWrap: HTMLElement;
  private readonly feedbackWrap: HTMLElement;
  private readonly fbHeading: HTMLElement;
  private readonly fbDetail: HTMLElement;
  private readonly fbNorm: HTMLElement;
  private readonly fbScore: HTMLElement;
  private readonly ackBtn: HTMLButtonElement;

  private choiceResolver: ((choice: InspectChoice | null) => void) | null = null;
  private closedResolver: (() => void) | null = null;
  private closedPromise: Promise<void> = Promise.resolve();
  private feedbackPhase = false;

  constructor(parent: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'dialog-backdrop hidden';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const header = document.createElement('header');
    header.className = 'dialog-header';
    const titleBox = document.createElement('div');
    titleBox.className = 'dialog-title';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'dialog-eyebrow';
    eyebrow.textContent = '近景检测';
    this.labelEl = document.createElement('b');
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.className = 'icon-btn';
    this.cancelBtn.setAttribute('aria-label', '关闭');
    this.cancelBtn.textContent = '✕';
    this.cancelBtn.addEventListener('click', () => this.cancel());
    titleBox.append(eyebrow, this.labelEl);
    header.append(titleBox, this.cancelBtn);

    this.descEl = document.createElement('p');
    this.descEl.className = 'dialog-desc';

    this.formWrap = document.createElement('div');
    this.formWrap.className = 'dialog-form';

    const typeField = document.createElement('div');
    typeField.className = 'dialog-field';
    const typeLegend = document.createElement('span');
    typeLegend.className = 'dialog-legend';
    typeLegend.textContent = '缺陷类型';
    this.typeGrid = document.createElement('div');
    this.typeGrid.className = 'pill-grid';
    DEFECT_TYPES.forEach((t, i) => {
      this.typeGrid.append(this.makeRadio('dlg-type', t, DEFECT_TYPE_LABELS[t], String(i + 1)));
    });
    typeField.append(typeLegend, this.typeGrid);

    const sevField = document.createElement('div');
    sevField.className = 'dialog-field';
    const sevLegend = document.createElement('span');
    sevLegend.className = 'dialog-legend';
    sevLegend.textContent = '严重程度';
    this.sevGrid = document.createElement('div');
    this.sevGrid.className = 'pill-grid pill-grid-3';
    SEVERITIES.forEach((s, i) => {
      this.sevGrid.append(this.makeRadio('dlg-severity', s, SEVERITY_LABELS[s], ['轻', '中', '重'][i] ?? s));
    });
    sevField.append(sevLegend, this.sevGrid);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    this.noDefectBtn = document.createElement('button');
    this.noDefectBtn.className = 'btn ghost';
    this.noDefectBtn.textContent = '无缺陷 · 不标记';
    this.noDefectBtn.addEventListener('click', () => this.submitNoDefect());
    this.submitBtn = document.createElement('button');
    this.submitBtn.className = 'btn primary';
    this.submitBtn.textContent = '提交判定';
    this.submitBtn.disabled = true;
    this.submitBtn.addEventListener('click', () => this.submitDefect());
    actions.append(this.noDefectBtn, this.submitBtn);

    this.formWrap.append(typeField, sevField, actions);

    this.feedbackWrap = document.createElement('div');
    this.feedbackWrap.className = 'dialog-feedback hidden';
    this.fbHeading = document.createElement('b');
    this.fbHeading.className = 'feedback-heading';
    this.fbDetail = document.createElement('p');
    this.fbDetail.className = 'feedback-detail';
    this.fbNorm = document.createElement('p');
    this.fbNorm.className = 'feedback-norm';
    this.fbScore = document.createElement('div');
    this.fbScore.className = 'feedback-score';
    this.ackBtn = document.createElement('button');
    this.ackBtn.className = 'btn primary';
    this.ackBtn.textContent = '收起,继续检测';
    this.ackBtn.addEventListener('click', () => this.close());
    this.feedbackWrap.append(this.fbHeading, this.fbDetail, this.fbNorm, this.fbScore, this.ackBtn);

    dialog.append(header, this.descEl, this.formWrap, this.feedbackWrap);
    this.backdrop.append(dialog);
    parent.append(this.backdrop);

    this.typeGrid.addEventListener('change', () => this.refreshSubmitState());
    this.sevGrid.addEventListener('change', () => this.refreshSubmitState());
    document.addEventListener('keydown', this.onKeydown);
  }

  get closed(): Promise<void> {
    return this.closedPromise;
  }

  /** 打开弹窗,返回玩家的判定选择;null 表示未判定关闭(Esc / ✕)。 */
  open(hotspot: HotspotData): Promise<InspectChoice | null> {
    this.feedbackPhase = false;
    this.labelEl.textContent = hotspot.label;
    this.descEl.textContent = hotspot.description;
    this.resetRadios();
    this.refreshSubmitState();
    this.formWrap.classList.remove('hidden');
    this.feedbackWrap.classList.add('hidden');
    this.backdrop.classList.remove('hidden');
    this.closedPromise = new Promise((resolve) => {
      this.closedResolver = resolve;
    });
    return new Promise((resolve) => {
      this.choiceResolver = resolve;
    });
  }

  /** 展示判定反馈(正确 / 误报 / 偏差 + 规范依据 + 得分)。 */
  showFeedback(fb: DialogFeedback): void {
    this.feedbackPhase = true;
    this.formWrap.classList.add('hidden');
    this.feedbackWrap.classList.remove('hidden');
    this.feedbackWrap.classList.toggle('ok', fb.ok);
    this.feedbackWrap.classList.toggle('bad', !fb.ok);
    this.fbHeading.textContent = `${fb.ok ? '✓' : '✗'} ${fb.heading}`;
    this.fbDetail.textContent = fb.detail;
    this.fbNorm.textContent = `规范依据:${fb.normNote}`;
    this.fbScore.textContent = fb.scoreText;
    this.ackBtn.focus();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeydown);
    this.backdrop.remove();
  }

  // —————————————————————— 内部 ——————————————————————

  private makeRadio(name: string, value: string, label: string, hotkey: string): HTMLElement {
    const pill = document.createElement('label');
    pill.className = 'pill';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    const text = document.createElement('span');
    text.textContent = label;
    const key = document.createElement('i');
    key.textContent = hotkey;
    pill.append(input, text, key);
    return pill;
  }

  private selectedValue(name: string): string | null {
    const checked = this.backdrop.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  }

  private resetRadios(): void {
    for (const input of this.backdrop.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      input.checked = false;
    }
  }

  private refreshSubmitState(): void {
    const type = this.selectedValue('dlg-type');
    const severity = this.selectedValue('dlg-severity');
    this.submitBtn.disabled = !(type && severity);
  }

  private submitDefect(): void {
    const type = this.selectedValue('dlg-type');
    const severity = this.selectedValue('dlg-severity');
    if (!type || !severity) return;
    this.submitBtn.disabled = true;
    this.noDefectBtn.disabled = true;
    this.resolveChoice({
      kind: 'defect',
      type: type as DefectType,
      severity: severity as Severity,
    });
  }

  private submitNoDefect(): void {
    this.submitBtn.disabled = true;
    this.noDefectBtn.disabled = true;
    this.resolveChoice({ kind: 'noDefect' });
  }

  private cancel(): void {
    if (this.feedbackPhase) return; // 反馈阶段必须点「收起」,避免误触丢失学习内容
    this.resolveChoice(null);
    this.close();
  }

  private resolveChoice(choice: InspectChoice | null): void {
    if (this.choiceResolver) {
      const resolve = this.choiceResolver;
      this.choiceResolver = null;
      resolve(choice);
    }
    if (choice === null) this.close(); // 取消直接关;提交后等反馈阶段手动关
  }

  private close(): void {
    this.backdrop.classList.add('hidden');
    this.submitBtn.disabled = false;
    this.noDefectBtn.disabled = false;
    this.feedbackPhase = false;
    if (this.closedResolver) {
      const resolve = this.closedResolver;
      this.closedResolver = null;
      resolve();
    }
  }

  private onKeydown = (e: KeyboardEvent): void => {
    if (this.backdrop.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.cancel();
      return;
    }
    if (this.feedbackPhase) return;
    // 数字键 1-7 快选缺陷类型,Q/W/E 快选严重度,Enter 提交
    const num = Number(e.key);
    if (num >= 1 && num <= DEFECT_TYPES.length) {
      const input = this.typeGrid.querySelectorAll<HTMLInputElement>('input[type="radio"]')[num - 1];
      if (input) {
        input.checked = true;
        this.refreshSubmitState();
      }
    }
    const sevKeys: Record<string, number> = { q: 0, w: 1, e: 2 };
    const sevIndex = sevKeys[e.key.toLowerCase()];
    if (sevIndex !== undefined) {
      const input = this.sevGrid.querySelectorAll<HTMLInputElement>('input[type="radio"]')[sevIndex];
      if (input) {
        input.checked = true;
        this.refreshSubmitState();
      }
    }
    if (e.key === 'Enter' && !this.submitBtn.disabled) this.submitDefect();
  };
}
