# Wolf Action - Game Flow & Timeline (游戏流程与时光轴)

本文档基于代码配置 (`constants.js/flowConfig`) 整理，记录了游戏核心状态机的完整流转逻辑。包含了时间、语音和UI状态的详细说明。

---

## 📅 1. 游戏准备 (Preparation)

| 顺序 | 阶段代码 | UI显示标题 | 默认时长 | 语音/动作 | 说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `ready` | 准备阶段 | - | - | 房主在大厅调整配置，玩家入座。 |
| 2 | `game_welcome` | 🎉 欢迎参与 | **8s** | `WELCOME` | 游戏开始欢迎语，自动播放。 |
| 3 | `deal_cards` | 🎴 发放身份 | **10s** | `DEAL_CARDS` | 屏幕显示身份牌，玩家确认身份。 |
| 4 | `night_start` | 🌙 入夜准备 | **10s** | `DARK_FULL` | 播放“天黑请闭眼”，进入夜间循环。 |

---

## 🌙 2. 夜晚阶段 (Night Cycle)

夜间行动严格按顺序执行。若板子中无对应角色，系统会自动跳过相关阶段（Wake/Action/Sleep）。

### 核心流程图
`Wild Child` -> `Cupid` -> `Lovers` -> `Guard` -> `Magician` -> `Dream Catcher` -> `Werewolf` -> `Wolf Beauty` -> `Gargoyle` -> `Witch` -> `Merchant` -> `Silencer` -> `Seer` -> `Gravekeeper` -> `Hunter`

### 详细时序表

| 角色 | 阶段类型 | 阶段代码 (`sub_phase`) | 默认时长 | 语音 (Audio Key) | 说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **野孩子** | 睁眼 | `wild_child_wake` | 2s | `WILD_CHILD_WAKE` | 首夜仅唤醒一次。 |
| | **行动** | `wild_child_action` | **15s** | `WILD_CHILD_OPERATE` | 选择榜样。 |
| | 闭眼 | `wild_child_sleep` | 2s | `WILD_CHILD_SLEEP` | |
| **丘比特** | 睁眼 | `cupid_wake` | 2s | `CUPID_WAKE` | 首夜仅唤醒一次。 |
| | **行动** | `cupid_action` | **25s** | `CUPID_OPERATE` | 连接两名玩家成为情侣。 |
| | 闭眼 | `cupid_sleep` | 2s | `CUPID_SLEEP` | |
| **情侣** | 睁眼 | `lover_wake` | 2s | `LOVER_WAKE` | 首夜互认身份。 |
| | **确认** | `lover_confirm` | **10s** | - | 确认队友。 |
| | 闭眼 | `lover_sleep` | 2s | `LOVER_END` | |
| **守卫** | 睁眼 | `guard_wake` | 2s | `GUARD_WAKE` | |
| | **行动** | `guard_action` | **10s** | `GUARD_OPERATE` | 选择守护目标（不可同守）。 |
| | 闭眼 | `guard_sleep` | 2s | `GUARD_SLEEP` | |
| **魔术师** | 睁眼 | `magician_wake` | 2s | `MAGICIAN_WAKE` | |
| | **行动** | `magician_action` | **10s** | `MAGICIAN_OPERATE` | 交换两人的号码牌。 |
| | 闭眼 | `magician_sleep` | 2s | `MAGICIAN_SLEEP` | |
| **摄梦人** | 睁眼 | `dream_catcher_wake` | 2s | `DREAM_CATCHER_WAKE` | |
| 摄梦人行动 | 技能 | `dream_catcher_action` | 10s | 摄梦人 | 摄梦人选择目标。 |
| 摄梦人闭眼 | 语音 | `dream_catcher_sleep` | 2s | 摄梦人 | "摄梦人请闭眼"。 |
| 狼人睁眼 | 语音 | `werewolf_wake` | 2s | 狼人 | "狼人请睁眼"。 |
| 狼人行动 | 技能 | `werewolf_action` | 15s | 狼人 | 狼人讨论并确认击杀目标。 |
| 狼人闭眼 | 语音 | `werewolf_sleep` | 2s | 狼人 | "狼人请闭眼"。 |
| 狼美人睁眼 | 语音 | `wolf_beauty_wake` | 2s | 狼美人 | "狼美人请睁眼"。 |
| 狼美人行动 | 技能 | `wolf_beauty_action` | 15s | 狼美人 | 狼美人选择魅惑目标。 |
| 狼美人闭眼 | 语音 | `wolf_beauty_sleep` | 2s | 狼美人 | "狼美人请闭眼"。 |
| 石像鬼睁眼 | 语音 | `gargoyle_wake` | 2s | 石像鬼 | "石像鬼请睁眼"。 |
| 石像鬼行动 | 技能 | `gargoyle_action` | 15s | 石像鬼 | 石像鬼查验身份。 |
| 石像鬼闭眼 | 语音 | `gargoyle_sleep` | 2s | 石像鬼 | "石像鬼请闭眼"。 |
| 女巫睁眼 | 语音 | `witch_wake` | 2s | 女巫 | "女巫请睁眼"。 |
| 女巫行动 | 技能 | `witch_action` | 10s | 女巫 | 女巫决定是否救人或毒人。 |
| 女巫闭眼 | 语音 | `witch_sleep` | 2s | 女巫 | "女巫请闭眼"。 |
| 黑商睁眼 | 语音 | `merchant_wake` | 2s | 黑商 | "黑商请睁眼"。 |
| 黑商行动 | 技能 | `merchant_action` | 20s | 黑商 | 黑商选择交易目标及物品。 |
| 黑商闭眼 | 语音 | `merchant_sleep` | 2s | 黑商 | "黑商请闭眼"。 |
| 禁言长老睁眼 | 语音 | `silencer_wake` | 2s | 禁言长老 | "禁言长老请睁眼"。 |
| 禁言长老行动 | 技能 | `silencer_action` | 15s | 禁言长老 | 禁言长老选择禁言目标。 |
| 禁言长老闭眼 | 语音 | `silencer_sleep` | 2s | 禁言长老 | "禁言长老请闭眼"。 |
| 预言家睁眼 | 语音 | `seer_wake` | 2s | 预言家 | "预言家请睁眼"。 |
| | **行动** | `seer_action` | **15s** | `SEER_OPERATE` | 查验一人身份（金水/查杀）。 |
| | 闭眼 | `seer_sleep` | 2s | `SEER_SLEEP` | |
| **守墓人** | 睁眼 | `gravekeeper_wake` | 2s | `GRAVEKEEPER_WAKE` | |
| | **行动** | `gravekeeper_action` | **15s** | `GRAVEKEEPER_OPERATE` | 得知该日出局玩家是好人还是狼人。 |
| | 闭眼 | `gravekeeper_sleep` | 2s | `GRAVEKEEPER_SLEEP` | |
| **猎人** | 睁眼 | `hunter_wake` | 2s | `HUNTER_WAKE` | |
| | **确认** | `hunter_confirm` | **10s** | `HUNTER_OPERATE` | 确认自己开枪状态（是否被毒）。 |
| | 闭眼 | `hunter_sleep` | 2s | `HUNTER_SLEEP` | |
| **计算** | 结算 | `calculate_death` | 0s | - | 系统计算夜间死亡结果。 |

---

## ☀️ 3. 白天阶段 (Day Cycle)

白天逻辑包含“流程循环”和“分支判定”（如警长竞选、PK、死亡触发）。

### 3.1 警长竞选 (Sheriff Election)
*仅在游戏第一天且配置开启警长时触发。*

1.  **`sheriff_nomination` (警长竞选)**: 玩家上警/退水 (Audio: `ELECTION_START`)。
2.  **`sheriff_speech` (竞选发言)**: 120s/人，轮流发言 (Audio: `SPEECH_START`)。
3.  **`sheriff_voting` (警长投票)**: 35s，警下投票 (Audio: `VOTE_START_SHERIFF`)。
4.  **`election_announce` (竞选结果)**: 公布当选警长 (Audio: `ELECTED`)。

### 3.2 常规日间流程 (Daily Routine)

| 顺序 | 阶段代码 | UI标题 | 时长 | 语音 (Audio Key) | 说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `day_announce` | 天亮了 | 1s | `DAWN` | 语音播报“天亮了”。 |
| 2 | `day_dawn` | **揭晓死讯** | 2s | `ANNOUNCE_DEATH` | 播报昨晚死亡名单（或平安夜）。 |
| 3 | `hunter_action`| **猎人行动** | 15s | `HUNTER_ACTION` | *[触发]* 仅当猎人死亡且可开枪时插入。 |
| 4 | `sheriff_handover`| **移交警徽** | 10s | `HANDOVER_BADGE` | *[触发]* 仅当警长死亡时插入。 |
| 5 | `discussion` | **自由讨论** | 300s | `DISCUSSION_START` | 全员自由麦序。 |
| 6 | `voting` | **放逐投票** | 40s | `VOTE_START_EXILE` | 点击头像投票放逐。 |
| 7 | `day_pk` | **PK发言** | 120s | `PK_START` | *[触发]* 若平票，平票者发言。 |
| 8 | `pk_voting` | **PK投票** | 40s | `VOTE_START_EXILE` | *[触发]* 若平票，再次投票。 |
| 9 | `exile_announce`| 投票结果 | - | `BE_EXILED` | 公布放逐结果。 |
| 10 | `leave_speech` | **发表遗言** | 20s | `LEAVE_SPEECH` | 被放逐者发言。 |
| -> | `night_start` | 入夜 | - | - | 循环回夜晚。 |

---

## 🏆 4. 游戏结束判定

| 结果 | 条件 | 语音 |
| :--- | :--- | :--- |
| **好人胜利** | 所有狼人死亡。 | `VILLAGER_WIN` |
| **狼人胜利** | 屠边：所有村民死亡 OR 所有神职死亡。 | `WOLF_WIN` |
| **第三方胜利** | 丘比特+情侣存活，其他全死。 | `THIRD_PARTY_WIN` |

---

## 🎮 5. 全局状态定义 (Status)

| Status | 描述 | 允许操作 |
| :--- | :--- | :--- |
| **waiting** | 准备中 | 入座、换头像、修改配置。**严禁播放语音**。 |
| **playing** | 游戏中 | 夜间/白天流程流转、技能释放、投票。 |
| **finished** | 游戏结束 | 复盘、重播胜利语音、重新开始。 |
