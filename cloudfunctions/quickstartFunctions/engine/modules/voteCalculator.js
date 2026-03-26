/**
 * 投票计算模块
 * 处理所有投票相关的逻辑
 */

/**
 * 计算投票结果
 * @param {object} params 参数对象
 * @param {object} params.votes 投票记录 {voterSeat: targetSeat}
 * @param {Array} params.players 玩家列表
 * @param {number} params.sheriffSeat 警长座位号
 * @param {Array} params.deadSeats 已死亡座位列表
 * @param {number|null} params.silencedSeat 被禁言的座位号
 * @param {boolean} params.useSheriffWeight 是否使用警长票权
 * @returns {object} 投票结果 {sorted, counts, validVotes}
 */
function calculateVotes({
  votes,
  players,
  sheriffSeat,
  deadSeats = [],
  silencedSeat = null,
  useSheriffWeight = true
}) {
  const counts = {};
  const validVotes = {};

  Object.entries(votes || {}).forEach(([voterSeatStr, target]) => {
    const voterSeat = Number(voterSeatStr);
    const targetSeat = Number(target);

    // 跳过弃票
    if (targetSeat === 0 || !targetSeat) return;

    // 检查投票者是否有效
    const voterPlayer = players.find(p => p.seat === voterSeat);
    if (!voterPlayer || !voterPlayer.is_alive || voterPlayer.death_reason) return;
    if (voterPlayer.role === 'idiot' && voterPlayer.role_state?.idiot_revealed) return;

    // 检查是否被禁言
    if (silencedSeat === voterSeat) return;

    // 检查投票者是否已死
    if (deadSeats.includes(voterSeat)) return;

    // 计算票权
    const weight = useSheriffWeight && voterSeat === sheriffSeat ? 1.5 : 1;
    counts[targetSeat] = (counts[targetSeat] || 0) + weight;
    validVotes[voterSeat] = targetSeat;
  });

  // 排序
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return { sorted, counts, validVotes };
}

/**
 * 获取投票获胜者
 * @param {Array} sorted 排序后的投票结果
 * @returns {object} {winner, isTie, winners}
 */
function getVoteWinner(sorted) {
  if (sorted.length === 0) {
    return { winner: null, isTie: false, winners: [] };
  }

  const maxVotes = sorted[0][1];
  const winners = sorted
    .filter(([_, votes]) => votes === maxVotes)
    .map(([seat]) => Number(seat));

  return {
    winner: winners.length === 1 ? winners[0] : null,
    isTie: winners.length > 1,
    winners
  };
}

/**
 * 检查历史是否重复
 * @param {Array} history 投票历史
 * @param {string} phaseKey 阶段key
 * @param {object} votes 投票记录
 * @returns {boolean}
 */
function isHistoryDuplicate(history, phaseKey, votes) {
  if (!history || history.length === 0) return false;

  const last = history[history.length - 1];
  if (!last || last.phase !== phaseKey) return false;

  try {
    return JSON.stringify(last.votes || {}) === JSON.stringify(votes || {});
  } catch (e) {
    return false;
  }
}

/**
 * 添加投票历史记录
 * @param {Array} history 原历史记录
 * @param {object} entry 新记录
 * @param {string} phaseKey 阶段key
 * @param {object} votes 投票记录
 * @returns {Array} 新历史记录
 */
function appendVoteHistory(history, entry, phaseKey, votes) {
  if (isHistoryDuplicate(history, phaseKey, votes)) {
    return history;
  }
  return [...(history || []), entry];
}

/**
 * 处理投票结果（放逐）
 * @param {object} params 参数
 * @returns {object} 处理结果
 */
function processExileVote({
  sorted,
  players,
  votes,
  dayCount,
  phase,
  history,
  log
}) {
  const { winner, isTie, winners } = getVoteWinner(sorted);

  // 无有效投票
  if (!winner && !isTie) {
    return {
      result: 'tie',
      updates: { 'game_state.exile_result': 'tie' },
      historyEntry: { day: dayCount, phase, votes, result: 'tie' },
      nextPhase: 'exile_announce'
    };
  }

  // 平票
  if (isTie) {
    return {
      result: 'pk',
      updates: { 'game_state.pk_candidates': winners },
      historyEntry: { day: dayCount, phase, votes, result: 'pk', pk_candidates: winners },
      nextPhase: 'day_pk'
    };
  }

  // 有唯一获胜者
  const pIdx = players.findIndex(p => p.seat === winner);
  const targetPlayer = players[pIdx];

  // 白痴翻牌
  if (targetPlayer?.role === 'idiot' && !targetPlayer.role_state?.idiot_revealed && targetPlayer.is_alive) {
    log && log(`${winner}号 白痴翻牌，免于放逐`);
    return {
      result: 'idiot_reveal',
      updates: {
        [`players.${pIdx}.role_state.idiot_revealed`]: true,
        'game_state.exile_result': 'idiot_reveal',
        'game_state.exile_seat': winner
      },
      historyEntry: { day: dayCount, phase, votes, result: 'idiot_reveal', target: winner },
      nextPhase: 'exile_announce'
    };
  }

  // 正常放逐
  if (targetPlayer?.is_alive) {
    log && log(`${winner}号 被投票放逐`);
    return {
      result: 'out',
      updates: {
        'game_state.last_exiled_seat': winner,
        'game_state.exile_result': 'out',
        'game_state.exile_seat': winner
      },
      historyEntry: { day: dayCount, phase, votes, result: 'out', target: winner },
      nextPhase: 'exile_announce'
    };
  }

  // 目标已不在场
  return {
    result: 'tie',
    updates: { 'game_state.exile_result': 'tie' },
    historyEntry: { day: dayCount, phase, votes, result: 'tie' },
    nextPhase: 'exile_announce'
  };
}

module.exports = {
  calculateVotes,
  getVoteWinner,
  isHistoryDuplicate,
  appendVoteHistory,
  processExileVote
};
