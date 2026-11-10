/**
 * 结算页(骨架):评级翻牌 + 成绩统计 + 生成报告(Markdown 文本预览,M1 完善导出)。
 */

import { GRADE_LABELS } from '../game/bci';

export interface SettlementStats {
  caseName: string;
  endReason: 'time' | 'done';
  score: number;
  resolvedCount: number;
  total: number;
  correct: number;
  partial: number;
  wrong: number;
  falsePositive: number;
  missed: { id: string; label: string }[];
  bci: number;
  grade: 1 | 2 | 3 | 4 | 5;
  timeUsedSec: number;
  timeLimitSec: number;
  markdown: string;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class SettlementView {
  private readonly backdrop: HTMLElement;
  private readonly reasonEl: HTMLElement;
  private readonly gradeNumEl: HTMLElement;
  private readonly gradeTextEl: HTMLElement;
  private readonly bciEl: HTMLElement;
  private readonly statScore: HTMLElement;
  private readonly statCorrect: HTMLElement;
  private readonly statPartial: HTMLElement;
  private readonly statFalsePositive: HTMLElement;
  private readonly statMissed: HTMLElement;
  private readonly statTime: HTMLElement;
  private readonly missedListEl: HTMLElement;
  private readonly reportPanel: HTMLElement;
  private readonly reportText: HTMLElement;

  constructor(
    parent: HTMLElement,
    callbacks: { onRestart: () => void; onExit: () => void },
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'settlement-backdrop hidden';

    const panel = document.createElement('div');
    panel.className = 'settlement-panel';

    const header = document.createElement('header');
    header.className = 'settlement-header';
    const titleBox = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '检测结束 · 技术状况评定';
    this.reasonEl = document.createElement('span');
    this.reasonEl.className = 'settlement-reason';
    titleBox.append(title, this.reasonEl);

    // 评级翻牌区(M3 加动画)
    const gradeBox = document.createElement('div');
    gradeBox.className = 'grade-card';
    this.gradeNumEl = document.createElement('div');
    this.gradeNumEl.className = 'grade-num';
    this.gradeTextEl = document.createElement('div');
    this.gradeTextEl.className = 'grade-text';
    const bciLabel = document.createElement('span');
    bciLabel.className = 'grade-bci-label';
    bciLabel.textContent = '简化 BCI';
    this.bciEl = document.createElement('div');
    this.bciEl.className = 'grade-bci';
    const bciBox = document.createElement('div');
    bciBox.className = 'grade-bci-box';
    bciBox.append(bciLabel, this.bciEl);
    gradeBox.append(this.gradeNumEl, this.gradeTextEl, bciBox);

    // 统计
    const stats = document.createElement('div');
    stats.className = 'settlement-stats';
    const stat = (label: string): { item: HTMLElement; value: HTMLElement } => {
      const item = document.createElement('div');
      item.className = 'stat-item';
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('b');
      item.append(l, v);
      stats.append(item);
      return { item, value: v };
    };
    this.statScore = stat('总得分').value;
    this.statCorrect = stat('判定正确').value;
    this.statPartial = stat('严重度偏差').value;
    this.statFalsePositive = stat('误报').value;
    this.statMissed = stat('漏检').value;
    this.statTime = stat('用时').value;

    // 漏检清单
    const missedBox = document.createElement('div');
    missedBox.className = 'missed-box';
    const missedTitle = document.createElement('span');
    missedTitle.className = 'missed-title';
    missedTitle.textContent = '漏检回放(M1:结算后高亮显示位置)';
    this.missedListEl = document.createElement('div');
    this.missedListEl.className = 'missed-list';
    missedBox.append(missedTitle, this.missedListEl);

    // 操作
    const actions = document.createElement('div');
    actions.className = 'settlement-actions';
    const reportBtn = document.createElement('button');
    reportBtn.className = 'btn primary';
    reportBtn.textContent = '生成检测报告';
    reportBtn.addEventListener('click', () => this.reportPanel.classList.remove('hidden'));
    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn';
    restartBtn.textContent = '再测一次';
    restartBtn.addEventListener('click', () => {
      this.hide();
      callbacks.onRestart();
    });
    const exitBtn = document.createElement('button');
    exitBtn.className = 'btn ghost';
    exitBtn.textContent = '返回案件选择';
    exitBtn.addEventListener('click', () => {
      this.hide();
      callbacks.onExit();
    });
    actions.append(reportBtn, restartBtn, exitBtn);

    // 报告面板(Markdown 文本预览)
    this.reportPanel = document.createElement('div');
    this.reportPanel.className = 'report-panel hidden';
    const reportHead = document.createElement('div');
    reportHead.className = 'report-head';
    const reportTitle = document.createElement('h3');
    reportTitle.textContent = '检测报告(Markdown)';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn small';
    copyBtn.textContent = '复制全文';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.reportText.textContent ?? '').then(
        () => {
          copyBtn.textContent = '已复制 ✓';
          window.setTimeout(() => (copyBtn.textContent = '复制全文'), 1600);
        },
        () => {
          copyBtn.textContent = '复制失败(手动选择)';
        },
      );
    });
    const closeReportBtn = document.createElement('button');
    closeReportBtn.className = 'icon-btn';
    closeReportBtn.textContent = '✕';
    closeReportBtn.setAttribute('aria-label', '关闭报告');
    closeReportBtn.addEventListener('click', () => this.reportPanel.classList.add('hidden'));
    reportHead.append(reportTitle, copyBtn, closeReportBtn);
    this.reportText = document.createElement('pre');
    this.reportText.className = 'report-pre';
    const reportNote = document.createElement('p');
    reportNote.className = 'report-note';
    reportNote.textContent = 'M0:先输出 Markdown 文本;M1 完善 .md 文件下载与浏览器打印 PDF 版式。';
    this.reportPanel.append(reportHead, this.reportText, reportNote);

    header.append(titleBox);
    panel.append(header, gradeBox, stats, missedBox, actions, this.reportPanel);
    this.backdrop.append(panel);
    parent.append(this.backdrop);
  }

  show(stats: SettlementStats): void {
    this.reasonEl.textContent =
      stats.endReason === 'time' ? `时间到 · ${stats.caseName}` : `全部检测点已处理 · ${stats.caseName}`;
    this.gradeNumEl.textContent = String(stats.grade);
    this.gradeTextEl.textContent = GRADE_LABELS[stats.grade];
    this.gradeNumEl.dataset.grade = String(stats.grade);
    this.bciEl.textContent = stats.bci.toFixed(1);
    this.statScore.textContent = String(stats.score);
    this.statCorrect.textContent = `${stats.correct}/${stats.total}`;
    this.statPartial.textContent = String(stats.partial);
    this.statFalsePositive.textContent = String(stats.falsePositive);
    this.statMissed.textContent = String(stats.missed.length);
    this.statTime.textContent = `${formatTime(stats.timeUsedSec)} / ${formatTime(stats.timeLimitSec)}`;
    this.missedListEl.replaceChildren();
    if (stats.missed.length === 0) {
      const none = document.createElement('span');
      none.className = 'missed-none';
      none.textContent = '无漏检,检测记录完整。';
      this.missedListEl.append(none);
    } else {
      for (const m of stats.missed) {
        const chip = document.createElement('span');
        chip.className = 'missed-chip';
        chip.textContent = m.label;
        this.missedListEl.append(chip);
      }
    }
    this.reportText.textContent = stats.markdown;
    this.reportPanel.classList.add('hidden');
    this.backdrop.classList.remove('hidden');
  }

  hide(): void {
    this.backdrop.classList.add('hidden');
  }

  dispose(): void {
    this.backdrop.remove();
  }
}
