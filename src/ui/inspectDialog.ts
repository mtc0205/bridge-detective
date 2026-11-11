/**
 * 检测弹窗(原生 DOM):
 * 热点名称 + 近景描述(占位文案)→ 缺陷类型单选(关卡范围)+ 严重度三选 → 提交即时反馈。
 *
 * 生命周期:
 *   open(hotspot) → 玩家选择 → resolve(InspectChoice | null)
 *   showFeedback(...) → 展示判定结果(正确/误报 + 规范依据)→「收起」→ closed Promise 结束
 *
 * 快捷键:1-9 及 Z/X/C/V/B/N// 选类型(支持 16 类全集)、Q/W/E 选严重度、
 * Enter 提交、Esc 取消;「图鉴」/ G 打开判定图鉴;近景描述含 mm 读数时
 * 提供「量测参考」卡尺(阈值建议,判级仍由玩家提交)。
 */

import { DEFECT_TYPE_LABELS, SEVERITIES, SEVERITY_LABELS } from '../game/level';
import type { DefectType, HotspotData, Severity } from '../game/level';
import type { InspectChoice } from '../game/scoring';
import { bucketAdvice, descriptionMeasurable, widthBucket } from '../game/measure';
import { MEASURE_MIN_MM, MEASURE_MAX_MM, CRACK_REGISTER_MM, CRACK_SEVERE_MM } from '../game/measure';

/** 类型快选键全集(覆盖 16 类;当前各案件范围 ≤8,后位键为全集兜底)。 */
export const DIALOG_HOTKEYS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Z', 'X', 'C', 'V', 'B', 'N', '/'];

/** 第 i 个类型的快选键标签(超出表长回退空串)。 */
export function dialogHotkey(index: number): string {
  return DIALOG_HOTKEYS[index] ?? '';
}

export interface DialogFeedback {
  ok: boolean;
  heading: string;
  detail: string;
  /** 规范依据(热点 normNote) */
  normNote: string;
  scoreText: string;
}

export interface InspectDialogOptions {
  /** 本关卡可选择的缺陷类型(来自 LevelData.defectTypes,缺省全集) */
  types: readonly DefectType[];
  /** 打开图鉴(不计时,图鉴覆盖在本弹窗之上) */
  onOpenCodex: () => void;
}

export class InspectDialog {
  private readonly backdrop: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private readonly typeGrid: HTMLElement;
  private readonly sevGrid: HTMLElement;
  private readonly submitBtn: HTMLButtonElement;
  private readonly noDefectBtn: HTMLButtonElement;
  private readonly codexBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private readonly formWrap: HTMLElement;
  private readonly feedbackWrap: HTMLElement;
  private readonly measureBtn: HTMLButtonElement;
  private readonly measurePanel: HTMLElement;
  private readonly measureValueEl: HTMLElement;
  private readonly measureJawEl: HTMLElement;
  private readonly measureVerdictEl: HTMLElement;
  private readonly measureSlider: HTMLInputElement;
  private readonly fbHeading: HTMLElement;
  private readonly fbDetail: HTMLElement;
  private readonly fbNorm: HTMLElement;
  private readonly fbScore: HTMLElement;
  private readonly ackBtn: HTMLButtonElement;
  private readonly types: readonly DefectType[];
  private readonly onOpenCodex: () => void;

  private choiceResolver: ((choice: InspectChoice | null) => void) | null = null;
  private closedResolver: (() => void) | null = null;
  private closedPromise: Promise<void> = Promise.resolve();
  private feedbackPhase = false;

  constructor(parent: HTMLElement, options: InspectDialogOptions) {
    this.types = options.types;
    this.onOpenCodex = options.onOpenCodex;
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
    this.types.forEach((t, i) => {
      this.typeGrid.append(this.makeRadio('dlg-type', t, DEFECT_TYPE_LABELS[t], dialogHotkey(i)));
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
      this.sevGrid.append(this.makeRadio('dlg-severity', s, SEVERITY_LABELS[s], ['Q', 'W', 'E'][i] ?? s));
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

    const assist = document.createElement('div');
    assist.className = 'dialog-assist';
    this.measureBtn = document.createElement('button');
    this.measureBtn.className = 'btn small';
    this.measureBtn.textContent = '量测参考';
    this.measureBtn.addEventListener('click', () => {
      const open = this.measurePanel.classList.toggle('hidden');
      this.measureBtn.textContent = open ? '量测参考' : '收起量测';
    });
    this.codexBtn = document.createElement('button');
    this.codexBtn.className = 'btn small';
    this.codexBtn.textContent = '判定图鉴(G)';
    this.codexBtn.addEventListener('click', () => this.onOpenCodex());
    const hint = document.createElement('span');
    hint.className = 'dialog-assist-hint';
    hint.textContent = `不确定就不标 —— 误报扣分 · 数字键快选类型 ${this.types.length <= 9 ? `1-${this.types.length}` : '见标签'}`;
    assist.append(this.codexBtn, this.measureBtn, hint);

    // —— 量测参考卡尺(近景描述含 mm 读数时可用)——
    this.measurePanel = document.createElement('div');
    this.measurePanel.className = 'measure-panel hidden';
    const mHead = document.createElement('div');
    mHead.className = 'measure-head';
    const mLabel = document.createElement('span');
    mLabel.textContent = '裂缝宽度卡尺 · 对准描述中的读数';
    this.measureValueEl = document.createElement('b');
    this.measureValueEl.className = 'measure-value';
    mHead.append(mLabel, this.measureValueEl);

    const scale = document.createElement('div');
    scale.className = 'measure-scale';
    const track = document.createElement('div');
    track.className = 'measure-scale-track';
    // 固定左爪(量程起点)
    const jawFixed = document.createElement('div');
    jawFixed.className = 'measure-scale-jaw';
    jawFixed.style.left = '0%';
    this.measureJawEl = document.createElement('div');
    this.measureJawEl.className = 'measure-scale-jaw';
    // 登记阈值 / 重级阈值刻度线
    const pct = (mm: number): string => `${(((mm - MEASURE_MIN_MM) / (MEASURE_MAX_MM - MEASURE_MIN_MM)) * 100).toFixed(1)}%`;
    const markReg = document.createElement('div');
    markReg.className = 'measure-scale-mark';
    markReg.style.left = pct(CRACK_REGISTER_MM);
    const markSev = document.createElement('div');
    markSev.className = 'measure-scale-mark';
    markSev.style.left = pct(CRACK_SEVERE_MM);
    this.measureSlider = document.createElement('input');
    this.measureSlider.type = 'range';
    this.measureSlider.min = String(MEASURE_MIN_MM);
    this.measureSlider.max = String(MEASURE_MAX_MM);
    this.measureSlider.step = '0.01';
    this.measureSlider.value = '0.2';
    this.measureSlider.addEventListener('input', () => this.refreshMeasure());
    scale.append(track, jawFixed, markReg, markSev, this.measureJawEl, this.measureSlider);

    const ticks = document.createElement('div');
    ticks.className = 'measure-scale-ticks';
    for (const t of ['0.05', `0.2 登记`, `0.3 重`, '0.6']) {
      const tick = document.createElement('span');
      tick.textContent = t;
      ticks.append(tick);
    }
    this.measureVerdictEl = document.createElement('p');
    this.measureVerdictEl.className = 'measure-verdict';
    this.measurePanel.append(mHead, scale, ticks, this.measureVerdictEl);

    this.formWrap.append(typeField, sevField, actions, assist, this.measurePanel);

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
    // 量测参考:仅近景描述带 mm 读数的缺陷提供(数据驱动,不泄答案)
    const measurable = descriptionMeasurable(hotspot.description);
    this.measureBtn.classList.toggle('hidden', !measurable);
    this.measurePanel.classList.add('hidden');
    this.measureBtn.textContent = '量测参考';
    this.measureSlider.value = '0.2';
    this.refreshMeasure();
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

  /** 卡尺读数 → 左右爪位置 / 读数 / 阈值建议。 */
  private refreshMeasure(): void {
    const mm = Number(this.measureSlider.value);
    const ratio = (mm - MEASURE_MIN_MM) / (MEASURE_MAX_MM - MEASURE_MIN_MM);
    this.measureJawEl.style.left = `${(ratio * 100).toFixed(1)}%`;
    this.measureValueEl.textContent = `${mm.toFixed(2)} mm`;
    const bucket = widthBucket(mm);
    this.measureVerdictEl.innerHTML = '';
    const text = document.createElement('span');
    if (bucket === 'severe') text.className = 'verdict-heavy';
    else if (bucket === 'register') text.className = 'verdict-log';
    text.textContent = bucketAdvice(bucket);
    this.measureVerdictEl.append(text);
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
    if (e.code === 'KeyG' && !this.feedbackPhase) {
      e.stopPropagation();
      this.onOpenCodex();
      return;
    }
    if (this.feedbackPhase) return;
    // 类型快选(1-9 + Z/X/C/V/B/N//,覆盖 16 类全集)、Q/W/E 严重度、Enter 提交
    const hotIndex = DIALOG_HOTKEYS.indexOf(e.key.toUpperCase());
    if (hotIndex >= 0 && hotIndex < this.types.length) {
      const input = this.typeGrid.querySelectorAll<HTMLInputElement>('input[type="radio"]')[hotIndex];
      if (input) {
        input.checked = true;
        this.refreshSubmitState();
      }
      return;
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
