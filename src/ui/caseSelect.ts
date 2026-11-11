/**
 * 案件选择页(游戏入口,原生 DOM)。
 *
 * 数据来自 `src/game/cases.ts` 注册表:教学关可直接进入;
 * 山村石拱桥 / 钱塘江大桥 1937 暂显「即将解锁」,同时展示其规划病害类型
 * (缺陷类型数据结构已就位,M2 出 Lux3D 资产后补关卡 JSON 即上架)。
 */

import { CASES } from '../game/cases';
import { DEFECT_TYPE_LABELS } from '../game/level';

export class CaseSelectView {
  private readonly backdrop: HTMLElement;

  constructor(parent: HTMLElement, onEnter: (levelId: string) => void) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'menu-backdrop';

    const wrap = document.createElement('div');
    wrap.className = 'menu-wrap';

    const hero = document.createElement('div');
    hero.className = 'menu-hero';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'menu-eyebrow';
    eyebrow.textContent = '群核 Aholo · 3D AI 黑客松参赛作品';
    const title = document.createElement('h1');
    title.textContent = '危桥侦探';
    const subtitle = document.createElement('p');
    subtitle.className = 'menu-sub';
    subtitle.textContent =
      'Bridge Detective —— 第一人称桥梁结构检测游戏:漫游危桥,按真实规范(JTG/T H21-2011)找出缺陷、定级、出具技术状况评定报告。';
    hero.append(eyebrow, title, subtitle);

    const cards = document.createElement('div');
    cards.className = 'menu-cards';
    for (const c of CASES) {
      const card = document.createElement('article');
      card.className = `case-card${c.locked ? ' locked' : ''}`;
      const tag = document.createElement('span');
      tag.className = 'case-tag';
      tag.textContent = c.tag;
      const name = document.createElement('h2');
      name.textContent = c.name;
      const meta = document.createElement('span');
      meta.className = 'case-meta';
      meta.textContent = c.meta;
      const desc = document.createElement('p');
      desc.textContent = c.desc;
      card.append(tag, name, meta, desc);

      // 锁定案件:展示规划病害类型(数据结构就位的可视化承诺)
      if (c.locked && c.plannedTypes && c.plannedTypes.length > 0) {
        const chips = document.createElement('div');
        chips.className = 'case-chips';
        for (const t of c.plannedTypes) {
          const chip = document.createElement('span');
          chip.className = 'case-chip';
          chip.textContent = DEFECT_TYPE_LABELS[t];
          chips.append(chip);
        }
        card.append(chips);
      }

      const action = document.createElement('button');
      action.className = 'btn primary';
      action.textContent = c.locked ? (c.lockedNote ?? '即将解锁') : '进入检测';
      action.disabled = c.locked;
      if (!c.locked) action.addEventListener('click', () => onEnter(c.id));
      card.append(action);
      cards.append(card);
    }

    const footer = document.createElement('footer');
    footer.className = 'menu-footer';
    footer.innerHTML =
      '<span>WASD 移动 · 鼠标 视角 · <b>E</b> 检测 · <b>G</b> 图鉴 · Shift 加速 · Esc 暂停</span>' +
      '<span>M1 交互闭环版(程序桥占位,Lux3D 资产 M2 接入)· 开发者:<b>?editor=1</b> 关卡编辑器</span>';

    wrap.append(hero, cards, footer);
    this.backdrop.append(wrap);
    parent.append(this.backdrop);
  }

  show(): void {
    this.backdrop.classList.remove('hidden');
  }

  hide(): void {
    this.backdrop.classList.add('hidden');
  }

  dispose(): void {
    this.backdrop.remove();
  }
}
