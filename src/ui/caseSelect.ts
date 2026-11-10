/**
 * 案件选择页(游戏入口,原生 DOM)。
 * M0 只开放教学关;两个后续案件以锁定卡形式展示路线图。
 */

interface CaseCard {
  id: string;
  tag: string;
  name: string;
  meta: string;
  desc: string;
  locked: boolean;
  lockedNote?: string;
}

const CASES: CaseCard[] = [
  {
    id: 'tutorial-viaduct',
    tag: '教学关',
    name: '城市高架 · 教学检测',
    meta: '9 个检测点 · 4 分钟 · 7 类缺陷',
    desc: '三跨预应力混凝土连续箱梁桥,日常定期检测。上桥面、下便道,练习「观察 → 判定 → 定级」的完整流程。',
    locked: false,
  },
  {
    id: 'stone-arch',
    tag: 'M1 解锁',
    name: '山村石拱桥 · 应急检测',
    meta: '暴雨后 · 砌石结构',
    desc: '暴雨过后 24 小时应急排查:砌石风化、灰缝脱落、拱圈渗水、桥台冲刷。',
    locked: true,
    lockedNote: 'M1 内容排期',
  },
  {
    id: 'qiantang-1949',
    tag: 'M2 解锁',
    name: '钱塘江大桥 1949 · 战损检测',
    meta: '旗舰案件 · Lux3D 复原',
    desc: '由历史照片生成战损钢桁梁桥:断杆、失铆、构件弯曲,为修复决策出具检测报告。',
    locked: true,
    lockedNote: '等待 Lux3D 资产',
  },
];

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
    subtitle.textContent = 'Bridge Detective —— 第一人称桥梁结构检测游戏:漫游危桥,按真实规范(JTG/T H21-2011)找出缺陷、定级、出具技术状况评定报告。';
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
      const action = document.createElement('button');
      action.className = 'btn primary';
      action.textContent = c.locked ? (c.lockedNote ?? '未解锁') : '进入检测';
      action.disabled = c.locked;
      if (!c.locked) action.addEventListener('click', () => onEnter(c.id));
      card.append(tag, name, meta, desc, action);
      cards.append(card);
    }

    const footer = document.createElement('footer');
    footer.className = 'menu-footer';
    footer.innerHTML =
      '<span>WASD 移动 · 鼠标 视角 · <b>E</b> 检测 · Shift 加速 · Esc 暂停</span>' +
      '<span>桌面端 Chrome / Edge · M0 骨架版本(程序桥占位,Lux3D 资产 M2 接入)</span>';

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
