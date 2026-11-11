/**
 * 关卡编辑器属性面板(原生 DOM,固定在视口右侧)。
 *
 * 只做「表单视图 + 事件回调」:所有数据变更经 hooks 回传给 Editor 改工作副本,
 * 再由 Editor 调回本面板的 setLevel / setSelection / syncSelectedHotspot 刷新视图,
 * 保证单一数据源(Editor.level)。
 */

import {
  COMPONENTS,
  COMPONENT_LABELS,
  DEFECT_TYPES,
  DEFECT_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
} from '../game/level';
import type { BridgeComponent, DefectType, HotspotData, LevelData, Severity } from '../game/level';

export interface EditorPanelHooks {
  onSelectHotspot: (id: string | null) => void;
  /** 关卡元信息 / 热点表单 / 类型范围任一变动(hotspot 变动需刷新 3D 标记) */
  onMetaChange: () => void;
  onHotspotChange: () => void;
  onDefectTypesChange: () => void;
  onAddAtCrosshair: () => void;
  onDeleteSelected: () => void;
  onSpawnHere: () => void;
  onValidate: () => void;
  onSave: () => void;
  onImport: (text: string) => void;
  onExit: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function labeled(label: string, input: HTMLElement): HTMLElement {
  const wrap = el('label', 'ed-field');
  const span = el('span', '', '');
  span.textContent = label;
  wrap.append(span, input);
  return wrap;
}

export class EditorPanel {
  readonly root: HTMLElement;
  private readonly hooks: EditorPanelHooks;
  private readonly metaFields: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
  private readonly hotspotInputs: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {};
  private readonly typeChecks = new Map<DefectType, HTMLInputElement>();
  private readonly hotspotListEl: HTMLElement;
  private readonly spawnInfoEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly formBox: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private selectedId: string | null = null;

  constructor(parent: HTMLElement, hooks: EditorPanelHooks) {
    this.hooks = hooks;
    this.root = el('div', 'editor-panel');

    const head = el('header', 'ed-head');
    const title = el('h2', '', '');
    title.textContent = '关卡编辑器';
    const hint = el('span', 'ed-head-hint');
    hint.textContent = '?editor=1 · 开发模式';
    head.append(title, hint);

    // —— 关卡元信息 ——
    const metaBox = el('section', 'ed-section');
    const metaTitle = el('h3', '', '');
    metaTitle.textContent = '关卡信息';
    metaBox.append(metaTitle);
    for (const key of ['id', 'caseName', 'subtitle'] as const) {
      const input = el('input', 'ed-input');
      input.addEventListener('input', () => this.hooks.onMetaChange());
      this.metaFields[key] = input;
      metaBox.append(labeled(key, input));
    }
    const brief = el('textarea', 'ed-input ed-textarea');
    brief.rows = 3;
    brief.addEventListener('input', () => this.hooks.onMetaChange());
    this.metaFields.brief = brief;
    metaBox.append(labeled('brief(开场卡)', brief));
    const timeLimit = el('input', 'ed-input');
    timeLimit.type = 'number';
    timeLimit.min = '30';
    timeLimit.max = '1800';
    timeLimit.step = '10';
    timeLimit.addEventListener('input', () => this.hooks.onMetaChange());
    this.metaFields.timeLimitSec = timeLimit;
    metaBox.append(labeled('timeLimitSec(时限)', timeLimit));
    const spawnRow = el('div', 'ed-spawn-row');
    this.spawnInfoEl = el('span', 'ed-spawn-info');
    const spawnBtn = el('button', 'btn small');
    spawnBtn.textContent = '出生点 = 当前视角';
    spawnBtn.addEventListener('click', () => this.hooks.onSpawnHere());
    spawnRow.append(this.spawnInfoEl, spawnBtn);
    metaBox.append(spawnRow);

    // —— 缺陷类型范围 ——
    const typesBox = el('section', 'ed-section');
    const typesTitle = el('h3', '', '');
    typesTitle.textContent = '弹窗类型范围(defectTypes)';
    typesBox.append(typesTitle);
    const grid = el('div', 'ed-types-grid');
    for (const t of DEFECT_TYPES) {
      const lab = el('label', 'ed-type-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addEventListener('change', () => this.hooks.onDefectTypesChange());
      this.typeChecks.set(t, cb);
      const text = el('span');
      text.textContent = DEFECT_TYPE_LABELS[t];
      lab.append(cb, text);
      grid.append(lab);
    }
    typesBox.append(grid);

    // —— 热点列表 ——
    const listBox = el('section', 'ed-section');
    const listTitle = el('h3', '', '');
    listTitle.textContent = '检测点列表';
    this.hotspotListEl = el('div', 'ed-hotspot-list');
    listBox.append(listTitle, this.hotspotListEl);

    // —— 选中热点表单 ——
    const formSection = el('section', 'ed-section');
    const formTitle = el('h3', '', '');
    formTitle.textContent = '选中检测点';
    this.formBox = el('div', 'ed-form');
    formSection.append(formTitle, this.formBox);
    this.buildHotspotForm();

    // —— 操作 ——
    const actionBar = el('div', 'ed-actions');
    const addBtn = el('button', 'btn small primary');
    addBtn.textContent = '在准星处新增 (左键点空处)';
    addBtn.addEventListener('click', () => this.hooks.onAddAtCrosshair());
    const delBtn = el('button', 'btn small');
    delBtn.textContent = '删除选中 (Del)';
    delBtn.addEventListener('click', () => this.hooks.onDeleteSelected());
    const validateBtn = el('button', 'btn small');
    validateBtn.textContent = '校验';
    validateBtn.addEventListener('click', () => this.hooks.onValidate());
    const saveBtn = el('button', 'btn small primary');
    saveBtn.textContent = '保存 JSON(下载+复制)';
    saveBtn.addEventListener('click', () => this.hooks.onSave());
    this.fileInput = el('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json';
    this.fileInput.className = 'ed-file-input';
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (!file) return;
      void file.text().then((text) => this.hooks.onImport(text));
      this.fileInput.value = '';
    });
    const importLabel = el('label', 'btn small');
    importLabel.textContent = '导入 JSON';
    importLabel.append(this.fileInput);
    const exitBtn = el('button', 'btn small ghost');
    exitBtn.textContent = '退出编辑器';
    exitBtn.addEventListener('click', () => this.hooks.onExit());
    actionBar.append(addBtn, delBtn, validateBtn, saveBtn, importLabel, exitBtn);

    this.statusEl = el('p', 'ed-status');

    this.root.append(head, metaBox, typesBox, listBox, formSection, actionBar, this.statusEl);
    parent.append(this.root);
  }

  // —————————————————————— 视图刷新(Editor 调用) ——————————————————————

  /** 关卡整体载入 / 元信息变动后刷新(不动热点表单的选择态)。 */
  setLevel(level: LevelData): void {
    this.metaFields.id.value = level.id;
    this.metaFields.caseName.value = level.caseName;
    this.metaFields.subtitle.value = level.subtitle;
    this.metaFields.brief.value = level.brief;
    this.metaFields.timeLimitSec.value = String(level.timeLimitSec);
    const scope = new Set(level.defectTypes ?? DEFECT_TYPES);
    for (const [t, cb] of this.typeChecks) cb.checked = scope.has(t);
    this.refreshSpawnInfo(level);
    this.refreshHotspotList(level);
  }

  refreshSpawnInfo(level: LevelData): void {
    const [x, y, z] = level.spawn.position;
    this.spawnInfoEl.textContent = `spawn (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) 朝向 ${level.spawn.yawDeg}°`;
  }

  refreshHotspotList(level: LevelData): void {
    this.hotspotListEl.replaceChildren();
    level.hotspots.forEach((h, i) => {
      const row = el('button', 'ed-hotspot-row');
      if (h.id === this.selectedId) row.classList.add('selected');
      const typeText =
        h.answer.type === 'none'
          ? '诱饵·无缺陷'
          : `${DEFECT_TYPE_LABELS[h.answer.type]}·${SEVERITY_LABELS[h.answer.severity]}`;
      row.textContent = `#${i + 1} ${h.label} · ${typeText} · ${COMPONENT_LABELS[h.component]}`;
      row.addEventListener('click', () => this.hooks.onSelectHotspot(h.id));
      this.hotspotListEl.append(row);
    });
  }

  setSelection(level: LevelData, id: string | null): void {
    this.selectedId = id;
    this.refreshHotspotList(level);
    const h = id ? level.hotspots.find((x) => x.id === id) : undefined;
    this.fillHotspotForm(h ?? null);
  }

  /** 外部(微调键 / 摆放)改动选中热点后同步表单。 */
  syncSelectedHotspot(level: LevelData): void {
    const h = this.selectedId ? level.hotspots.find((x) => x.id === this.selectedId) : undefined;
    this.fillHotspotForm(h ?? null);
    this.refreshHotspotList(level);
  }

  setStatus(text: string, ok = true): void {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('bad', !ok);
  }

  // —————————————————————— 表单读取(Editor 调用) ——————————————————————

  /** 读取关卡元信息表单(空白时回退当前值)。 */
  getMetaValues(level: LevelData): { id: string; caseName: string; subtitle: string; brief: string; timeLimitSec: number } {
    const id = this.metaFields.id.value.trim() || level.id;
    const caseName = this.metaFields.caseName.value.trim() || level.caseName;
    const subtitle = this.metaFields.subtitle.value.trim() || level.subtitle;
    const brief = this.metaFields.brief.value.trim() || level.brief;
    const timeLimit = Number(this.metaFields.timeLimitSec.value);
    return { id, caseName, subtitle, brief, timeLimitSec: Number.isFinite(timeLimit) && timeLimit > 0 ? timeLimit : level.timeLimitSec };
  }

  /** 读取勾选的类型范围;一个都没勾返回空数组(校验时会报错)。 */
  getCheckedTypes(): DefectType[] {
    return DEFECT_TYPES.filter((t) => this.typeChecks.get(t)?.checked);
  }

  /** 把热点表单值套到热点对象上(位置/答案/文案全部来自表单)。 */
  applyHotspotForm(h: HotspotData): void {
    const v = this.hotspotInputs;
    h.id = v.id.value.trim() || h.id;
    h.label = v.label.value.trim() || h.label;
    h.description = v.description.value;
    h.normNote = v.normNote.value;
    h.component = v.component.value as BridgeComponent;
    const type = v.answerType.value as DefectType | 'none';
    const sev = v.answerSeverity.value as Severity | 'none';
    if (type === 'none' || sev === 'none') {
      h.answer = { type: 'none', severity: 'none' };
    } else {
      h.answer = { type, severity: sev };
    }
    const r = Number(v.interactRadius.value);
    if (Number.isFinite(r) && r > 0) h.interactRadius = r;
    else delete h.interactRadius;
    h.position = [
      Number(v.px.value) || 0,
      Number(v.py.value) || 0,
      Number(v.pz.value) || 0,
    ];
  }

  dispose(): void {
    this.root.remove();
  }

  // —————————————————————— 内部 ——————————————————————

  private buildHotspotForm(): void {
    const f = this.hotspotInputs;
    const text = (key: string): HTMLInputElement => {
      const input = el('input', 'ed-input');
      input.addEventListener('input', () => this.hooks.onHotspotChange());
      f[key] = input;
      return input;
    };
    const num = (key: string, step: string): HTMLInputElement => {
      const input = text(key);
      input.type = 'number';
      input.step = step;
      return input;
    };

    const idInput = text('id');
    const labelInput = text('label');
    const componentSel = el('select', 'ed-input');
    for (const c of COMPONENTS) {
      const opt = el('option');
      opt.value = c;
      opt.textContent = COMPONENT_LABELS[c];
      componentSel.append(opt);
    }
    componentSel.addEventListener('change', () => this.hooks.onHotspotChange());
    f.component = componentSel;

    const typeSel = el('select', 'ed-input');
    for (const t of [...DEFECT_TYPES, 'none'] as const) {
      const opt = el('option');
      opt.value = t;
      opt.textContent = t === 'none' ? '无缺陷(诱饵)' : DEFECT_TYPE_LABELS[t];
      typeSel.append(opt);
    }
    typeSel.addEventListener('change', () => this.hooks.onHotspotChange());
    f.answerType = typeSel;

    const sevSel = el('select', 'ed-input');
    for (const s of [...SEVERITIES, 'none'] as const) {
      const opt = el('option');
      opt.value = s;
      opt.textContent = s === 'none' ? '无(配诱饵)' : SEVERITY_LABELS[s];
      sevSel.append(opt);
    }
    sevSel.addEventListener('change', () => this.hooks.onHotspotChange());
    f.answerSeverity = sevSel;

    const radiusInput = num('interactRadius', '0.5');
    radiusInput.min = '0.5';
    radiusInput.max = '20';

    const posRow = el('div', 'ed-pos-row');
    const px = num('px', '0.1');
    const py = num('py', '0.1');
    const pz = num('pz', '0.1');
    posRow.append(labeled('x', px), labeled('y', py), labeled('z', pz));

    const desc = el('textarea', 'ed-input ed-textarea');
    desc.rows = 3;
    desc.addEventListener('input', () => this.hooks.onHotspotChange());
    f.description = desc;

    const norm = el('textarea', 'ed-input ed-textarea');
    norm.rows = 3;
    norm.addEventListener('input', () => this.hooks.onHotspotChange());
    f.normNote = norm;

    this.formBox.append(
      labeled('id', idInput),
      labeled('label(位置名,勿泄底)', labelInput),
      labeled('component(部件)', componentSel),
      labeled('答案类型', typeSel),
      labeled('答案严重度', sevSel),
      labeled('interactRadius(米,可空)', radiusInput),
      posRow,
      labeled('description(近景文案)', desc),
      labeled('normNote(规范依据)', norm),
    );
  }

  private fillHotspotForm(h: HotspotData | null): void {
    const inputs = Object.values(this.hotspotInputs);
    this.formBox.classList.toggle('disabled', h === null);
    for (const input of inputs) input.disabled = h === null;
    if (!h) return;
    const v = this.hotspotInputs;
    v.id.value = h.id;
    v.label.value = h.label;
    v.component.value = h.component;
    v.answerType.value = h.answer.type;
    v.answerSeverity.value = h.answer.severity;
    v.interactRadius.value = h.interactRadius !== undefined ? String(h.interactRadius) : '';
    v.px.value = String(h.position[0]);
    v.py.value = String(h.position[1]);
    v.pz.value = String(h.position[2]);
    v.description.value = h.description;
    v.normNote.value = h.normNote;
  }
}
