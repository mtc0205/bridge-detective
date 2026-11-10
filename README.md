# 危桥侦探 Bridge Detective(参赛作品)

第一人称桥梁结构检测游戏 —— 群核科技 Aholo 全球 3D AI 黑客松。

玩家扮演检测工程师漫游桥梁,用「检测仪」找出结构缺陷,按真实规范
(JTG/T H21-2011《公路桥梁技术状况评定标准》简化版)选择缺陷类型与严重度,
结算时输出简化 BCI 评级与 Markdown 检测报告。

**当前版本:M0 骨架**(2026-11-11)。案件场景为参数化程序箱梁桥占位;
Lux3D 生成资产将于 M2 通过统一的 `ILevelAsset` 接口接入(见下)。

## 快速开始

```bash
npm install       # 安装依赖(three@0.165 / vitest)
npm run dev       # 开发服务器(默认 http://localhost:5173)
npm run build     # 类型检查 + 产线构建(输出 dist/,纯静态可托管)
npm run preview   # 本地预览构建产物
npm run test      # vitest 单元测试(纯逻辑,47 个用例)
npm run typecheck # 仅 tsc --noEmit
```

桌面端 Chrome / Edge(需要 WebGL 与 Pointer Lock;不支持移动端)。

## 操作

| 按键 | 功能 |
| --- | --- |
| `W A S D` / 方向键 | 移动(眼高 1.65m,贴地 + 重力) |
| 鼠标(点击画面锁定指针) | 视角 |
| `E` | 对准热点微光标记后打开检测弹窗 |
| `1-7` / `Q W E` | 弹窗内快选缺陷类型 / 严重度 |
| `Enter` | 提交判定 |
| `Shift` | 加速跑 |
| `Esc` | 释放指针 / 暂停 |

动线:沿桥面从西桥头走到东桥头 → 经两端路堤坡道下到地面 →
从桥南侧绕进桥下便道 → 仰头检查墩柱与支座。

## 玩法循环(M0 已闭环)

选案件 → 开场卡 → 漫游 → 准星对准微光标记按 `E` → 近景描述 + 选
【缺陷类型 ×7】+【严重度 轻/中/重】(或「无缺陷·不标记」)→ 即时判定
反馈(正确 +100 / 严重度偏差 +40 / 类型误判 0 / 误报 −50 / 放走真缺陷 0)
→ 全部处理完或 4 分钟时限到 → 结算:简化 BCI → 1~5 类技术状况等级 +
统计 + 漏检清单 + Markdown 检测报告(页面文本预览,可复制)。

教学关含 9 个检测点、7 类缺陷、1 个「完好诱饵」(正确答案是「无缺陷」,
考察不误报)。

## 目录结构

```
src/
├── main.ts                 # 入口:案件选择 → Game 生命周期
├── levels/                 # 关卡 JSON(热点坐标 + 答案 + 规范文案)
│   └── tutorial-viaduct.json
├── bridge/
│   ├── levelAsset.ts       # ★ ILevelAsset 统一资产接口(M2 换 Lux3D 实现即插即用)
│   └── boxGirder.ts        # M0 程序箱梁桥(桥面 90m×12m、双柱墩×2、栏杆、路堤、便道、河流)
├── player/
│   ├── terrain.ts          # 纯逻辑碰撞:多层高度场 + AABB 墙(可测试)
│   ├── terrain.test.ts
│   └── controller.ts       # 第一人称控制器(WASD + PointerLock + 重力贴地)
├── gameplay/
│   └── hotspot.ts          # 3D 热点:浮动微光标记 + 准星对准检测
├── game/
│   ├── level.ts            # 关卡类型 + parseLevel 校验(纯逻辑)
│   ├── level.test.ts
│   ├── scoring.ts          # 判定计分(BRIEF 简化版,TODO 标注规范条目)
│   ├── scoring.test.ts
│   ├── bci.ts              # 简化 BCI 评级(1~5 类,JTG/T H21-2011 简化)
│   ├── bci.test.ts
│   ├── session.ts          # 一局会话:判定记录 / 计分 / 计时 / 报告生成
│   └── game.ts             # 编排器:Three.js 装配 + 状态机
└── ui/                     # 原生 DOM:Hud / 检测弹窗 / 案件选择 / 结算页
```

测试只覆盖纯逻辑(判定计分、BCI 评级、关卡校验、地形碰撞);3D 与 UI 不做单测。

## 资产接口(M2 替换点)

玩法层只依赖 `src/bridge/levelAsset.ts` 的 `ILevelAsset`:

- `root` 场景内容;`colliders` AABB 阻挡;`surfacesAt(x,z)` 多层可行走面;
- `decorateScene(scene)` 天空 / 雾 / 光照;`update` / `dispose`。

M2 Lux3D 解锁后实现 `Lux3DAssetFactory`(glb/gltf 或 3DGS iframe 方案),
在 `main.ts` 处替换 `createBoxGirderAsset` 即可,玩法代码零改动。

## 路线图

- **M0(11-11)✅** 骨架:工程 / 程序桥 / 控制器 / 热点 / 弹窗 / HUD / 结算骨架 / 测试
- **M1(11-12~13)** 交互闭环打磨、量测小游戏、报告导出(.md / 打印 PDF)、关卡编辑器、教学关完整布点
- **M2(11-14~15)** Lux3D 真实资产生成与接入、三案件成品、性能优化(<20MB)
- **M3(11-16~17)** 音效 / 光影氛围 / 引导 / 结算动画
- **M4(11-18~19)** 报告书、演示视频、双通道部署(zai.site + GitHub Pages)

## 已知限制(M0)

- 场景为素色程序桥占位,损伤无贴图表现(近景为文字描述),Lux3D 资产 M2 接入
- 报告仅页面 Markdown 预览与复制,文件导出 / PDF 版式在 M1
- 判定严重度直接取关卡标准答案,M1 计划加入「量测小游戏」输出实测值
- 漏检回放(高亮位置)为结算页文字列表,M1 做场景内回放
- 不支持移动端触控(M3 评估降级方案)
