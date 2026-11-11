/**
 * 危桥侦探 Bridge Detective —— 入口。
 *
 * 案件选择(注册表驱动)→ Game(关卡 + 资产工厂)→ 结算 → 再测 / 返回。
 * ?editor=1:进入内部关卡编辑器(开发模式,见 src/editor/)。
 * M2:Lux3D 资产到位后,只需在 cases.ts 换资产工厂。
 */

import './style.css';
import { Game } from './game/game';
import { findPlayableCase } from './game/cases';
import { CaseSelectView } from './ui/caseSelect';

const hostElement = document.getElementById('app');
if (!hostElement) throw new Error('缺少 #app 挂载点');
const host: HTMLElement = hostElement;

let game: Game | null = null;
let currentLevelId: string | null = null;

function startGame(levelId?: string): void {
  const id = levelId ?? currentLevelId;
  if (!id) return;
  const def = findPlayableCase(id);
  if (!def || !def.loadLevel || !def.assetFactory) return; // 锁定 / 未知案件兜底
  currentLevelId = id;
  if (game) game.dispose();
  game = new Game(host, def.loadLevel(), def.assetFactory, {
    onExit: () => {
      game?.dispose();
      game = null;
      currentLevelId = null;
      menu.show();
    },
    onRestart: () => {
      startGame(); // 不带参 = 重开当前案件;内部先 dispose 旧实例再重建
    },
  });
  game.start();
}

const menu = new CaseSelectView(host, (levelId) => {
  menu.hide();
  startGame(levelId);
});

menu.show();
