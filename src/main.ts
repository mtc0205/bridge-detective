/**
 * 危桥侦探 Bridge Detective —— 入口。
 *
 * 案件选择 → Game(关卡 + 资产工厂)→ 结算 → 再测 / 返回。
 * M2:Lux3D 资产到位后,只需把 createBoxGirderAsset 换成 Lux3D 工厂。
 */

import './style.css';
import { parseLevel } from './game/level';
import { Game } from './game/game';
import { CaseSelectView } from './ui/caseSelect';
import { createBoxGirderAsset } from './bridge/boxGirder';
import tutorialViaduct from './levels/tutorial-viaduct.json';

const level = parseLevel(tutorialViaduct);
const hostElement = document.getElementById('app');
if (!hostElement) throw new Error('缺少 #app 挂载点');
const host: HTMLElement = hostElement;

let game: Game | null = null;

function startGame(): void {
  if (game) game.dispose();
  game = new Game(host, level, createBoxGirderAsset, {
    onExit: () => {
      game?.dispose();
      game = null;
      menu.show();
    },
    onRestart: () => {
      startGame(); // startGame 内部先 dispose 旧实例再重建
    },
  });
  game.start();
}

const menu = new CaseSelectView(host, (levelId) => {
  if (levelId !== level.id) return; // 锁定卡不可点,兜底
  menu.hide();
  startGame();
});

menu.show();
