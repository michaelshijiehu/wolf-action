/**
 * 游戏指令模块
 * 处理游戏阶段指令的生成
 */

const { flowConfig } = require('../../constants');

const WOLF_ROLES = ['werewolf', 'wolf_king', 'white_wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle', 'night_wolf'];

/**
 * 创建阶段指令
 * @param {string} key 阶段key
 * @param {object} params 参数
 * @param {number} params.forcedDuration 强制时长
 * @param {object} params.gameState 当前游戏状态
 * @param {object} params.updates 更新对象
 * @param {object} params.currentRoundActions 当前回合动作
 * @returns {object} 指令更新对象
 */
function createInstruction(key, { forcedDuration, gameState, updates = {}, currentRoundActions = {} } = {}) {
  const cfg = flowConfig[key];
  if (!cfg) return null;

  // 计算时长
  let duration;
  if (forcedDuration !== undefined) {
    duration = forcedDuration;
  } else if (Array.isArray(cfg.duration)) {
    const [min, max] = cfg.duration;
    duration = Math.floor(Math.random() * (max - min + 1)) + min;
  } else if (cfg.duration !== undefined) {
    duration = cfg.duration;
  } else {
    duration = 15;
  }

  // 构建临时游戏状态（用于音频生成）
  const tempGs = { ...gameState };
  Object.keys(updates).forEach(k => {
    if (k.startsWith('game_state.')) {
      tempGs[k.replace('game_state.', '')] = updates[k];
    }
  });

  // 确保关键状态存在
  ['sheriff_seat', 'exile_seat', 'exile_result', 'election_result'].forEach(prop => {
    if (updates[`game_state.${prop}`] !== undefined) {
      tempGs[prop] = updates[`game_state.${prop}`];
    }
  });

  // 生成音频：先播上一阶段退出语音（如“请闭眼”），再播当前阶段进入语音
  const audio = [];
  const prevSubPhase = gameState?.sub_phase;
  if (prevSubPhase && prevSubPhase !== key) {
    const prevCfg = flowConfig[prevSubPhase];
    const prevRoleReq = prevCfg?.roleRequired;
    let shouldPlayExit = false;
    if (prevCfg?.getExitAudio && prevRoleReq) {
      if (prevRoleReq === 'werewolf') {
        shouldPlayExit = !!currentRoundActions.werewolf_acted;
      } else {
        shouldPlayExit = !!currentRoundActions[`${prevRoleReq}_acted`];
      }
    }
    if (shouldPlayExit) {
      const exitAudio = prevCfg.getExitAudio(tempGs) || [];
      if (Array.isArray(exitAudio)) audio.push(...exitAudio);
      else audio.push(exitAudio);
    }
  }
  if (cfg.getAudio) {
    const phaseAudio = cfg.getAudio(tempGs) || [];
    if (Array.isArray(phaseAudio)) audio.push(...phaseAudio);
    else audio.push(phaseAudio);
  }

  // 构建指令对象
  const instruction = {
    sub_phase: key,
    expire_time: Date.now() + duration * 1000,
    duration,
    audio,
    roleRequired: cfg.roleRequired || null,
    title: cfg.ui?.title || '',
    tips: cfg.ui?.tips || '',
    actionBtn: cfg.ui?.actionBtn || '',
    color: cfg.ui?.color || '#ffffff',
    actionPanel: cfg.ui?.actionPanel || 'none',
    brightness: cfg.ui?.brightness !== undefined ? cfg.ui.brightness : 1.0,
    auto_proceed: !!cfg.auto_proceed
  };

  // 核心修复：为女巫阶段注入击杀信息
  if (key === 'witch_phase') {
    const actions = currentRoundActions || {};
    const wolfVotes = actions.werewolf_votes || {};
    const counts = {};
    Object.values(wolfVotes).forEach(v => {
      if (v > 0) counts[v] = (counts[v] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
    let killTarget = null;
    if (sorted.length > 0 && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) {
      killTarget = Number(sorted[0][0]);
    }
    instruction.witch_info = { killTarget };
  }

  // 核心修复：狼人阶段开始时，强制清空上一次的残余显示
  if (key === 'werewolf_phase') {
    updates['current_round_actions.werewolf_votes'] = {};
  }

  return {
    'game_state.sub_phase': key,
    'game_state.current_instruction': instruction,
    'game_state.stage_deadline': Date.now() + duration * 1000
  };
}

/**
 * 查找下一个有效状态
 * @param {string} currentSub 当前子阶段
 * @param {object} roomDoc 房间文档
 * @returns {string|null} 下一个子阶段
 */
function findNextState(currentSub, roomDoc) {
  let nextSub = flowConfig[currentSub]?.next || null;
  let safeguard = 0;

  while (nextSub && safeguard < 50) {
    const cfg = flowConfig[nextSub];
    if (!cfg) return null;

    let shouldSkip = false;

    // 检查角色是否存在
    if (cfg.roleRequired) {
      const roleCount = roomDoc.config.roles[cfg.roleRequired] || 0;
      if (roleCount === 0) {
        // 狼人特殊处理（包括狼人变体）
        if (cfg.roleRequired === 'werewolf') {
          const hasWolf = Object.keys(roomDoc.config.roles).some(
            r => WOLF_ROLES.includes(r) && roomDoc.config.roles[r] > 0
          );
          if (!hasWolf) shouldSkip = true;
        } else {
          shouldSkip = true;
        }
      }
    }

    // 检查是否仅限首夜
    if (cfg.firstNightOnly && roomDoc.game_state.day_count > 1) {
      shouldSkip = true;
    }

    // 自定义跳过逻辑
    if (!shouldSkip && cfg.shouldSkip) {
      shouldSkip = cfg.shouldSkip(roomDoc.game_state, roomDoc.players);
    }

    if (!shouldSkip) return nextSub;

    nextSub = cfg.next;
    safeguard++;
  }

  return null;
}



module.exports = {
  createInstruction,
  findNextState,
  WOLF_ROLES
};
