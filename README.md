# 宝可梦先锋 Web

把 RPG Maker XP / Pokémon Essentials 的《宝可梦先锋》移植成浏览器可玩的网页版：直接解析原作的 `Data/*.rxdata` 与 `Graphics/`、`Audio/` 素材，用 TypeScript + Phaser 重新实现地图渲染、行走与事件系统。

## 在线试玩

**https://fengqingxiao.github.io/bkm/**

- 移动：方向键 / WASD / 屏幕方向键
- 交互：Z / 空格 / 回车 / 屏幕 A 键
- URL 参数：`?map=56` 指定地图，`&x=22&y=58` 指定出生坐标

手机建议横屏；触屏方向键与 A 键在屏幕左右下角。

## 已实现

- **数据**：Ruby Marshal 4.8 解析器，319 张地图、7,547 个事件、107,110 条指令转成 JSON
- **渲染**：32×32 图块，48 组合自动图块拼接，按行 + 优先级的 RGSS 层级排序（`y*32 + priority*32 + 32`），水面动画
- **通行**：移植 `Game_Map#playerPassable?`，支持方向位、地形标签（悬崖、桥、`ignore_passability`）
- **角色**：帧尺寸 = 行走图 / 4，脚底居中锚点，四方向四帧，行走速度 128 px/s（RGSS 3 档）
- **事件**：文本/选项、条件分支、循环、开关/变量/独立开关、地图传送、等待、BGM/SE、移动路线
- **NPC**：随机走动的 NPC、`step_anime` 待机动画、对话时转身面向玩家

## 未实现

- 战斗与野生遇敌（`species.dat`、`moves.dat` 已可解析，尚未接入）
- 存档
- `355/655` Ruby 脚本指令（全包 6,564 次调用，会记录到 HUD 的 `u=` 计数）
- autorun / parallel 事件、悬崖跳跃、桥面状态

## 本地运行

```bash
npm install
npm run dev          # http://localhost:5173/?map=56
npm run test         # 19 项单元测试
npm run build        # 产物在 dist/
```

仓库内的 `public/data` 与 `public/assets` 是已生成的数据与切片素材，克隆后无需原始游戏包即可运行。若要重新生成：

```bash
node tools/build-data.mjs        # 需要 assets-src/宝可梦先锋/Data
node tools/extract-assets.mjs 56 # 按地图 id 提取素材
```

## 目录

```
src/engine/     图块渲染、自动图块、通行判定、角色、事件解释器、音频
src/scenes/     地图场景（装配、交互、传送、NPC）
src/ui/         对话框、触屏按键
tools/          Marshal 解析、数据管线、素材提取
tests/          marshal / autotile / character / passability
```

## 版权

原作与美术、音频素材版权归原作者及素材来源方所有（见游戏包内 `Credits/`，含 Gen 8 Project 等）。本项目仅供学习与研究，请勿用于商业用途。
