# 狼人杀法官助手 - 技术实现文档

本文档记录了项目的核心架构、逻辑实现及关键技术点，方便后续开发与优化。

## 1. 架构概览

本项目采用 **微信小程序 + 微信云开发 (TCB)** 架构。

*   **前端 (Miniprogram)**: 负责 UI 展示、3D 动画渲染、手势交互、音频播放。
*   **后端 (Cloud Functions)**: `quickstartFunctions` 是核心逻辑单元，采用动态状态机引擎处理阶段流转。
*   **数据库 (Cloud DB)**: 存储房间状态、对局记录及用户数据。

---

## 2. 后端核心逻辑 (`quickstartFunctions`)

### 2.1 递归状态机 (`findNextState`)
项目摒弃了硬编码的阶段跳转，改为使用基于 `flowConfig` 的递归寻址引擎：
*   **动态性**: 自动根据本局 `config.roles` 过滤掉未开启的角色阶段。
*   **存活校验**: 自动跳过角色已出局的行动环节（如预言家死亡后不再睁眼）。
*   **故障安全**: 当无法推导下一阶段时，自动回退至“自由讨论”阶段，防止流程卡死。

### 2.2 自动结算引擎 (`calculate_death`)
核心死亡判定算法位于 `nextPhase` 的结算分支：
*   **奶穿逻辑**: 判定同一目标是否被“守卫守护”且被“女巫救治”。
*   **多重伤害**: 同时处理狼人击杀与女巫毒杀。
*   **状态同步**: 自动清理已应用的死亡名单，并生成汉化版的获胜原因记录。

### 2.3 Bot 模拟系统 (`botLogic.js`)
为 19+ 种角色提供了完整的模拟行为：
*   **特殊能力**: 魔术师（随机交换）、黑商（随机交易道具）、野孩子（随机选择榜样）等。
*   **自动化测试**: 配合“填充机器人”功能，可实现全职业自动对局测试。

---

## 3. UI/UX 创新实现

### 3.1 3D 身份牌翻转
*   **实现**: 基于 CSS 3D Transforms (`rotateY`) 与 `perspective` 属性。
*   **安全性**: 信息仅在卡片“正面”展示，并设置了 3 秒（手动）/ 10 秒（发牌阶段）的自动收起计时器，有效防止窥屏。
*   **渲染保障**: 配合 `opacity` 与 `z-index` 的动态切换，确保在各类移动端设备上均能稳定显示。

### 3.2 Theater Mode (全屏视野)
*   **容器**: 采用 `movable-area` 与 `movable-view` 组件。
*   **交互**: 支持单指拖拽圆桌位置、双指捏合进行 0.5x - 2.0x 缩放。
*   **动态布局**: 在全屏模式下，座位半径自动从 `280rpx` 扩充至 `450rpx`，彻底解决多人局下的头像重叠问题。

---

## 4. 日志与信息系统

### 4.1 动态事件简讯 (Ticker)
*   **实时性**: 自动从 `timeline` 中提取最近 3 条记录进行倒序展示。
*   **过滤**: 前后端双重过滤掉“天亮了”、“进入结算”等系统垃圾日志，仅保留玩家关键动作。

### 4.2 上帝视野 (God View)
*   **功能**: 为法官提供可折叠的全场身份清单。
*   **视觉**: 根据阵营（狼/神/民）及存活状态（灰度+✕标记）进行差异化渲染。

---

## 5. 关键文件索引

| 文件路径 | 作用 |
| :--- | :--- |
| `cloudfunctions/quickstartFunctions/index.js` | 递归流转引擎、结算逻辑、胜负判定 |
| `cloudfunctions/quickstartFunctions/botLogic.js` | 19+ 种角色的机器人模拟逻辑 |
| `miniprogram/pages/room/room.js` | 3D 翻牌逻辑、重连检测、UI状态同步 |
| `miniprogram/pages/room/room.wxml` | Theater Mode 结构、动态汇总面板 |
| `miniprogram/pages/rules/rules.wxml` | 补全的 19+ 角色全量规则与进阶攻略 |

---

## 6. 已知问题与避坑指南 (Troubleshooting)

### 6.1 阶段连跳 / 双重触发 (Double Execution)
**现象**：
游戏流程中，某些阶段（特别是 `auto_proceed: true` 的阶段，如发牌、入夜准备）出现“秒过”现象。日志显示同一 RequestID 内连续执行了两次 `nextPhase`，导致前端音频被瞬间切断，UI 甚至来不及渲染。

**根因分析**：
云函数 `exports.main` 入口处存在一个“保险机制”：
```javascript
// 旧代码
roomDoc = await checkAutoProceedInternal(eventRoomId, roomDoc, roomDocId);
```
该函数会检查当前阶段是否过期（Deadline Passed），如果过期则自动调用 `nextPhase`。

当**前端倒计时结束**并主动发起 `nextPhase` 请求时：
1.  云函数入口首先执行 `checkAutoProceedInternal`。此时阶段确实已过期，于是它执行了一次 `nextPhase`（状态 A -> B）。
2.  云函数继续执行 `acts[type]`，即响应前端的 `nextPhase` 请求。
3.  由于传入的 `roomDoc` 已经是更新后的（状态 B），且如果状态 B 也是 `auto_proceed` 且时长较短（或逻辑判断允许立即通过），可能会被误触发或造成逻辑混乱。即便状态 B 没过期，**同一请求被执行了两次 nextPhase** 也是严重的逻辑错误。

**解决方案**：
在入口处增加拦截，如果是明确的 `nextPhase` 请求，则跳过 `checkAutoProceedInternal` 检查。

```javascript
// 修复后代码
if (type !== 'nextPhase') {
  roomDoc = await checkAutoProceedInternal(eventRoomId, roomDoc, roomDocId);
}
```

### 6.2 死亡结算与公布时机 (Death Application Timing)
**现象**：
天刚亮（甚至在警长竞选开始前），UI 上玩家头像就已经变灰显示死亡，导致剧透。

**根因**：
`calculate_death` 阶段（入夜结算）直接更新了 `players` 数组中的 `is_alive` 状态。虽然前端在 `nextPhase` 切换到 `day_announce`，但数据已经是最新的“已死”状态。

**解决方案**：
分离“死亡计算”与“死亡应用”：
1.  `calculate_death`: 仅计算死亡名单存入 `game_state.last_night_deaths`，**不更新** `players`。
2.  `day_dawn` (正式公布死讯): 在此阶段读取 `last_night_deaths` 并正式将 `is_alive` 置为 `false`。
3.  **注意**：在 `day_announce` 或 `election_announce` 跳转到 `day_dawn` 时，必须显式调用 `applyDeaths()` 辅助函数来执行更新。

### 6.3 投票历史丢失 (Missing Voting History)
**现象**：
投票结束后，弹窗显示“暂无投票记录”。

**根因**：
`nextPhase` 中的投票结算分支（`voting`, `sheriff_voting`）仅计算了结果，忘记将当轮详细票型 push 到 `game_state.voting_history` 数组中。

**解决方案**：
在每次投票结算前，构建包含 `day`, `phase`, `votes`, `result` 的记录对象，并追加到 `voting_history`。

---

## 7. 关键业务逻辑变更记录 (Changelog)

### 2026-01-27
1.  **音频播放优化**:
    *   前端 `room.js` 改为优先直接使用后端推送的 `instruction.audio` 字段，不再发起额外的 `getAudioQueue` 云函数请求，消除网络延迟带来的音频卡顿。
    *   后端 `constants.js` 全面延长了夜间行动时长（2s -> 4s+），给予玩家充足反应时间。
    *   优化了 `ANNOUNCE_DEATH` 的音频组合逻辑（“X号，Y号，倒在...”）。

2.  **警长竞选完善**:
    *   修复了 PK 轮候选人仍能投票的 Bug（现在通过 `checkActionPermission` 严格禁止）。
    *   增加了 PK 再次平票导致警徽流失的逻辑。
    *   增加了竞选结束/流失后的状态清理（自动放下手）。

3.  **角色体验提升**:
    *   **预言家**: 后端限制每晚只能验一次；前端移除冗余弹窗。
    *   **女巫**: 在夜间行动阶段，后端会推送昨晚被杀目标（仅限女巫可见），UI 显示“🚨 昨晚被杀”标记。
    *   **猎人**: 修复了 `hunterAction` 缺失导致的卡死问题，并实现了开枪即时结算。

4.  **发牌流程优化**:
    *   发牌时长延长至 10s。
    *   新增“确认身份”按钮，支持全员确认后提前结束倒计时，自动进入下一阶段。