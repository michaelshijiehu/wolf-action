# 角色流程闭环表（基于当前代码）

说明：
- “动作入口”= 云函数 `type` 是否存在。
- “结算使用点”= `calculate_death`/`nextPhase` 是否读取并生效。

## 夜间关键角色

| 角色 | 阶段/触发 | 动作入口 | 状态落库 | 结算使用点 | 闭环结论 |
| --- | --- | --- | --- | --- | --- |
| 狼人（含变种） | `werewolf_action` | ✅ `werewolfAction` | ✅ `werewolf_votes` | ✅ `calculate_death` | 基本闭环（但后端未校验身份） |
| 女巫 | `witch_action` | ✅ `witchAction` | ✅ `witch_action` | ✅ `calculate_death` | 闭环 |
| 守卫 | `guard_action` | ✅ `guardAction` | ✅ `guard_protect` | ✅ `calculate_death` | 闭环 |
| 预言家 | `seer_action` | ✅ `seerAction` | ✅ `seer_check` | ❌ 不影响结算 | 信息型闭环 |
| 丘比特 | `cupid_action` | ✅ `cupidAction` | ✅ `game_state.lovers` | ✅ `calculate_death` | 闭环（但缺角色/生存校验） |
| 魔术师 | `magician_action` | ✅ `magicianAction` | ✅ `magician_exchange` | ✅ `calculate_death`（交换目标） | 闭环 |
| 摄梦人 | `dream_catcher_action` | ✅ `dreamCatcherAction` | ✅ `dream_catcher_sleep` | ❌ 未使用 | 断裂 |
| 狼美人 | `wolf_beauty_action` | ✅ `wolfBeautyAction` | ✅ `wolf_beauty_charm` | ✅ `calculate_death`（殉情） | 闭环 |
| 石像鬼 | `gargoyle_action` | ✅ `gargoyleAction` | ✅ `gargoyle_check` + 历史 | ❌ 不影响结算 | 信息型闭环（仅回显） |
| 黑商 | `merchant_action` | ✅ `merchantAction` | ✅ `merchant_trade/item` | ❌ 未使用 | 断裂 |
| 禁言长老 | `silencer_action` | ✅ `silencerAction` | ✅ `silencer_silence` | ❌ 未使用 | 断裂 |
| 守墓人 | `gravekeeper_action` | ✅ `gravekeeperAction` | ❌ 空逻辑 | ❌ | 断裂 |
| 野孩子 | `wild_child_action` | ✅ `wildChildAction` | ✅ `model_seat` | ✅ `calculate_death`（转阵营标记） | 半闭环（胜负未考虑） |
| 猎人确认 | `hunter_confirm` | ❌ | ❌ | ❌ | 仅 UI |

## 白天相关

| 角色/行为 | 阶段 | 动作入口 | 状态落库 | 结算使用点 | 闭环结论 |
| --- | --- | --- | --- | --- | --- |
| 猎人开枪 | `hunter_action` | ✅ `hunterAction` | ✅ `hunter_shoot` | ✅ `nextPhase` | 闭环 |
| 警长选举/移交 | `sheriff_*` | ✅ `sheriffAction` | ✅ `sheriff_votes/sheriff_seat` | ✅ `nextPhase` | 闭环 |
| 放逐投票 | `voting/pk_voting` | ✅ `voteAction` | ✅ `day_votes` | ✅ `nextPhase` | 闭环 |
| 白痴翻牌 | `voting` | ❌ | ✅ `idiot_revealed` | ✅ `nextPhase` | 自动闭环 |

## 仍未闭环的核心点

1. 摄梦人、黑商、禁言长老、守墓人：
   - 已能行动，但行动结果未进入结算或规则效果。
2. 野孩子转阵营：
   - `is_wolf_side` 仅标记，胜负判定仍不计入狼阵营。
3. 多数新增角色入口缺角色与生存校验：
   - 存在规则漏洞，任何玩家可能调用。
