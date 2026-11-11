/**
 * 检测报告页(原生 DOM):结算后可阅读的 HTML 报告 + 导出。
 *
 * - 数据与 Markdown 报告同源(Session.reportRows / buildReportMarkdown),
 *   保证「结算数字与过程一致」;
 * - 下载:Blob → a[download] 生成 .md 文件;
 * - 打印:把报告克隆到 body 直挂的 #print-root(白底打印版式),
 *   window.print() 后移除;浏览器「另存为 PDF」即可导出 PDF。
 */

import type { ReportRow } from '../game/session';
import { GRADE_ACTIONS, GRADE_LABELS } from '../game/bci';
import { COMPONENT_LABELS, SEVERITY_LABELS } from '../game/level';
import type { BridgeGrade } from '../game/bci';

export interface ReportStats {
  caseId: string;
  caseName: string;
  subtitle: string;
  grade: BridgeGrade;
  componentBci: { deck: number; superstructure: number; substructure: number };
  overallBci: number;
  criticalTrigger: string | null;
  groundTruthBci: number;
  timeUsedSec: number;
  timeLimitSec: number;
  rows: ReportRow[];
  missedText: string;
  falsePositiveText: string;
  qualityText: string;
  markdown: string;
}

const VERDICT_TEXT: Record<ReportRow['verdict'], string> = {
  correct: '✅ 正确',
  decoyPass: '✅ 完好确认',
  severityMiss: '🟡 严重度偏差',
  falsePositive: '❌ 误报',
  missedDefect: '⭕ 漏检',
  typeMiss: '❌ 类型误判',
  unprocessed: '⭕ 未检测',
};

function el(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function buildSheet(stats: ReportStats, forPrint: boolean): HTMLElement {
  const sheet = el('div', 'report-sheet');
  if (forPrint) sheet.classList.add('print-mode');

  const h1 = el('h1', '', '桥梁技术状况评定报告');
  const sub = el('p', 'report-sheet-sub', `${stats.caseName}(${stats.subtitle})`);
  sheet.append(h1, sub);

  const meta = el('div', 'report-meta');
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const metaItems: [string, string][] = [
    ['检测日期', dateStr],
    ['检测人', '玩家(检测工程师)'],
    ['评定依据', 'JTG/T H21-2011《公路桥梁技术状况评定标准》(教学简化)'],
    ['检测用时', `${Math.floor(stats.timeUsedSec / 60)} 分 ${Math.round(stats.timeUsedSec % 60)} 秒 / 限时 ${Math.round(stats.timeLimitSec / 60)} 分钟`],
  ];
  for (const [k, v] of metaItems) {
    const item = el('div', 'report-meta-item');
    item.append(el('span', '', k), el('b', '', v));
    meta.append(item);
  }
  sheet.append(meta);

  // —— 一、缺陷清单 ——
  sheet.append(el('h2', '', '一、缺陷清单'));
  const table = el('table', 'report-table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const th of ['#', '检测点', '部位', '判定结果', '严重度', '判定', '规范依据', '处治建议']) {
    headRow.append(el('th', '', th));
  }
  thead.append(headRow);
  const tbody = el('tbody');
  for (const row of stats.rows) {
    const tr = el('tr');
    tr.classList.add(`verdict-${row.verdict}`);
    tr.append(
      el('td', '', String(row.index)),
      el('td', '', row.label),
      el('td', '', COMPONENT_LABELS[row.component]),
      el('td', '', row.judgedType ?? '(未检测)'),
      el('td', '', row.judgedSeverity ? SEVERITY_LABELS[row.judgedSeverity] : '—'),
      el('td', '', VERDICT_TEXT[row.verdict]),
      el('td', 'report-norm', row.normNote),
      el('td', 'report-repair', row.repair),
    );
    tbody.append(tr);
  }
  table.append(thead, tbody);
  sheet.append(table);

  // —— 二、技术状况评定 ——
  sheet.append(el('h2', '', '二、技术状况评定(三部件加权)'));
  const bciTable = el('table', 'report-table report-table-bci');
  const bhead = el('thead');
  const bhRow = el('tr');
  for (const th of ['部件', 'BCI', '权重']) bhRow.append(el('th', '', th));
  bhead.append(bhRow);
  const bbody = el('tbody');
  const bciRows: [string, number, string][] = [
    ['桥面系', stats.componentBci.deck, '0.2'],
    ['上部结构', stats.componentBci.superstructure, '0.4'],
    ['下部结构', stats.componentBci.substructure, '0.4'],
  ];
  for (const [name, value, weight] of bciRows) {
    const tr = el('tr');
    tr.append(el('td', '', name), el('td', '', value.toFixed(1)), el('td', '', weight));
    bbody.append(tr);
  }
  bciTable.append(bhead, bbody);
  sheet.append(bciTable);

  const conclusion = el('div', 'report-conclusion');
  const overall = el('p');
  overall.append(el('b', '', `整体 BCI = ${stats.overallBci.toFixed(1)}`));
  conclusion.append(overall);
  if (stats.criticalTrigger) {
    const crit = el('p', 'report-critical');
    crit.textContent = '⚠ 触发关键安全隐患条款:重级「支座脱空 / 构件断裂 / 拱圈砌石松动」直接压低评定(BCI 上限 57,四类·不合格)。';
    conclusion.append(crit);
  }
  const gradeLine = el('p');
  gradeLine.append(
    el('b', '', `技术状况等级:${GRADE_LABELS[stats.grade]}`),
    el('span', '', `　处理建议:${GRADE_ACTIONS[stats.grade]}`),
  );
  conclusion.append(gradeLine);
  const ref = el('p', 'report-ref');
  ref.textContent = `对照参考:若全部实际缺陷计入,BCI = ${stats.groundTruthBci.toFixed(1)}(漏检会使评定偏乐观)。`;
  conclusion.append(ref);
  sheet.append(conclusion);

  // —— 三、漏检与误报 ——
  sheet.append(el('h2', '', '三、漏检与误报'));
  sheet.append(el('p', '', stats.missedText));
  if (stats.falsePositiveText) sheet.append(el('p', '', stats.falsePositiveText));

  // —— 四、检测质量统计 ——
  sheet.append(el('h2', '', '四、检测质量统计'));
  sheet.append(el('p', '', stats.qualityText));

  const foot = el('p', 'report-sheet-foot', '危桥侦探 Bridge Detective 生成 · 判定口径见游戏内图鉴(JTG/T H21-2011 简化)');
  sheet.append(foot);
  return sheet;
}

export class ReportView {
  private readonly backdrop: HTMLElement;
  private readonly body: HTMLElement;
  private readonly statusEl: HTMLElement;
  private current: ReportStats | null = null;

  constructor(parent: HTMLElement, onClose: () => void) {
    this.backdrop = el('div', 'report-backdrop hidden');
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) onClose();
    });

    const panel = el('div', 'report-view-panel');
    const head = el('header', 'report-view-head');
    const titleBox = el('div');
    titleBox.append(el('span', 'report-view-eyebrow', '检测报告 · 可导出'));
    const h2 = el('h2', '', '桥梁技术状况评定报告');
    titleBox.append(h2);
    const actions = el('div', 'report-view-actions');

    const dlBtn = el('button', 'btn primary') as HTMLButtonElement;
    dlBtn.textContent = '下载 Markdown';
    dlBtn.addEventListener('click', () => this.download());
    const printBtn = el('button', 'btn') as HTMLButtonElement;
    printBtn.textContent = '打印 / 导出 PDF';
    printBtn.addEventListener('click', () => this.print());
    const closeBtn = el('button', 'btn ghost') as HTMLButtonElement;
    closeBtn.textContent = '返回结算';
    closeBtn.addEventListener('click', onClose);
    actions.append(dlBtn, printBtn, closeBtn);

    head.append(titleBox, actions);

    this.body = el('div', 'report-view-body');
    this.statusEl = el('p', 'report-view-status hidden');
    panel.append(head, this.body, this.statusEl);
    this.backdrop.append(panel);
    parent.append(this.backdrop);
  }

  show(stats: ReportStats): void {
    this.current = stats;
    this.body.replaceChildren(buildSheet(stats, false));
    this.setStatus(null);
    this.backdrop.classList.remove('hidden');
  }

  hide(): void {
    this.backdrop.classList.add('hidden');
  }

  dispose(): void {
    this.backdrop.remove();
  }

  // —————————————————————— 导出 ——————————————————————

  private setStatus(text: string | null): void {
    this.statusEl.textContent = text ?? '';
    this.statusEl.classList.toggle('hidden', text === null);
  }

  /** 生成 .md 文件下载(文件名:案件id-检测报告-日期时间.md)。 */
  private download(): void {
    if (!this.current) return;
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const blob = new Blob([this.current.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.current.caseId}-检测报告-${stamp}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.setStatus(`已下载 ${a.download}(若未弹出,请检查浏览器下载设置)`);
  }

  /** 克隆白底打印版式到 body 下的 #print-root 并调起打印(另存为 PDF 即可)。 */
  private print(): void {
    if (!this.current) return;
    document.getElementById('print-root')?.remove();
    const root = el('div', '');
    root.id = 'print-root';
    root.append(buildSheet(this.current, true));
    document.body.append(root);
    const cleanup = (): void => {
      root.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => window.print(), 50);
  }
}
