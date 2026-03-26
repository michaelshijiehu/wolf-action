/**
 * 胜负判定模块
 * 处理游戏胜负判定逻辑
 */

const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];

/**
 * 检查游戏胜负
 * @param {Array} players 玩家列表
 * @param {Array} lovers 情侣座位列表
 * @param {string} winMode 胜利模式 'kill_side' | 'kill_all'
 * @returns {object|null} 胜负结果 {winner, reason}
 */
function checkWinner(players, lovers = [], winMode = 'kill_side') {
  const alivePlayers = players.filter(p => p.is_alive);

  // 统计存活阵营
  const aliveWolves = alivePlayers.filter(p => {
    // 狼人阵营
    if (WOLF_ROLES.includes(p.role)) return true;
    // 野孩子变节后
    if (p.role === 'wild_child' && p.role_state?.is_wolf_side) return true;
    return false;
  });

  const aliveGood = alivePlayers.filter(p => {
    if (WOLF_ROLES.includes(p.role)) return false;
    if (p.role === 'wild_child' && p.role_state?.is_wolf_side) return false;
    return true;
  });

  const aliveGods = aliveGood.filter(p => p.role !== 'villager');
  const aliveVillagers = aliveGood.filter(p => p.role === 'villager');

  // 1. 狼人全灭 - 好人胜
  if (aliveWolves.length === 0) {
    return { winner: 'good', reason: 'villager_win' };
  }

  // 2. 狼人获胜判定
  if (winMode === 'kill_all') {
    // 屠城：好人全灭
    if (aliveGood.length === 0) {
      return { winner: 'werewolf', reason: 'wolf_kill_all' };
    }
  } else {
    // 屠边判定 (默认)
    // 屠神：神职全灭
    if (aliveGods.length === 0) {
      return { winner: 'werewolf', reason: 'wolf_kill_god' };
    }
    // 屠民：村民全灭
    if (aliveVillagers.length === 0) {
      return { winner: 'werewolf', reason: 'wolf_kill_villager' };
    }
  }

  // 3. 好人全灭兜底 (防止配置漏掉)
  if (aliveGood.length === 0) {
    return { winner: 'werewolf', reason: 'wolf_kill_all' };
  }

  // 4. 第三方胜利判定（丘比特情侣绑票）
  if (lovers.length === 2) {
    const aliveLovers = lovers.filter(seat => {
      const p = players.find(pl => pl.seat === seat);
      return p && p.is_alive;
    });

    // 如果情侣都活着，且情侣之外的玩家都死了
    if (aliveLovers.length === 2) {
      const otherAliveCount = alivePlayers.filter(p => !lovers.includes(p.seat)).length;
      if (otherAliveCount === 0) {
        return { winner: 'third_party', reason: 'lover_win' };
      }
    }
  }

  // 游戏继续
  return null;
}

/**
 * 获取阵营统计
 * @param {Array} players 玩家列表
 * @returns {object} 阵营统计
 */
function getFactionStats(players) {
  const stats = {
    total: players.length,
    alive: 0,
    wolves: { total: 0, alive: 0 },
    gods: { total: 0, alive: 0 },
    villagers: { total: 0, alive: 0 },
    thirdParty: { total: 0, alive: 0 }
  };

  players.forEach(p => {
    stats.alive += p.is_alive ? 1 : 0;

    if (WOLF_ROLES.includes(p.role) || (p.role === 'wild_child' && p.role_state?.is_wolf_side)) {
      stats.wolves.total++;
      if (p.is_alive) stats.wolves.alive++;
    } else if (p.role === 'villager') {
      stats.villagers.total++;
      if (p.is_alive) stats.villagers.alive++;
    } else if (['cupid'].includes(p.role)) {
      // 第三方
      stats.thirdParty.total++;
      if (p.is_alive) stats.thirdParty.alive++;
    } else {
      stats.gods.total++;
      if (p.is_alive) stats.gods.alive++;
    }
  });

  return stats;
}

/**
 * 获取胜负原因描述
 * @param {string} reason 原因代码
 * @returns {string}
 */
function getWinReasonText(reason) {
  const reasonMap = {
    'villager_win': '狼人全灭',
    'wolf_kill_god': '神职屠边',
    'wolf_kill_villager': '村民屠边',
    'wolf_kill_all': '好人全灭',
    'lover_win': '情侣绑票'
  };
  return reasonMap[reason] || '';
}

module.exports = {
  checkWinner,
  getFactionStats,
  getWinReasonText,
  WOLF_ROLES
};
