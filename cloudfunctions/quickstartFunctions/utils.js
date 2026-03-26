/**
 * 云函数工具模块
 * 提供数据库操作、游戏逻辑等辅助功能
 */

const { AUDIO_KEYS, flowConfig } = require('./constants');
const winnerChecker = require('./engine/modules/winnerChecker');

// ==========================================
// 数据库操作优化
// ==========================================

/**
 * 应用更新到对象（支持嵌套路径）
 * @param {object} obj 原对象
 * @param {object} updates 更新对象
 * @returns {object} 新对象
 */
function applyUpdates(obj, updates) {
  // 优化：浅拷贝 + 按需深拷贝
  const newObj = { ...obj };
  
  for (const [key, value] of Object.entries(updates)) {
    const parts = key.split('.');
    let current = newObj;
    let currentOriginal = obj;
    
    // 遍历路径，按需创建对象
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      
      // 如果是新创建的对象，需要复制
      if (!(part in current)) {
        // 根据下一个key判断是数组还是对象
        const nextPart = parts[i + 1];
        current[part] = isNaN(Number(nextPart)) ? {} : [];
      } else if (current[part] === currentOriginal[part]) {
        // 如果引用的是原对象，需要拷贝
        current[part] = Array.isArray(current[part]) 
          ? [...current[part]] 
          : { ...current[part] };
      }
      
      currentOriginal = currentOriginal?.[part];
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }
  
  return newObj;
}

/**
 * 批量查询优化
 * @param {object} db 数据库实例
 * @param {Array} queries 查询配置数组 [{collection, where, limit}]
 * @returns {Promise<Array>} 查询结果数组
 */
async function batchQuery(db, queries) {
  return Promise.all(
    queries.map(async ({ collection, where, limit = 100 }) => {
      try {
        let query = db.collection(collection);
        if (where) query = query.where(where);
        if (limit) query = query.limit(limit);
        const res = await query.get();
        return { success: true, data: res.data };
      } catch (e) {
        console.error(`[batchQuery] Query failed:`, collection, e);
        return { success: false, error: e, data: [] };
      }
    })
  );
}

/**
 * 带重试的数据库操作
 * @param {Function} operation 数据库操作函数
 * @param {number} maxRetries 最大重试次数
 * @param {number} delay 重试延迟
 */
async function withRetry(operation, maxRetries = 2, delay = 500) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (e) {
      lastError = e;
      
      // 只对特定错误重试
      const shouldRetry = e.errCode === -1 || 
        e.errMsg?.includes('timeout') ||
        e.errMsg?.includes('network');
      
      if (!shouldRetry || i === maxRetries) {
        throw e;
      }
      
      console.log(`[withRetry] Retry ${i + 1}/${maxRetries} after error:`, e.errMsg || e.message);
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  
  throw lastError;
}

// ==========================================
// 游戏记录保存
// ==========================================

/**
 * 保存游戏记录
 * @param {object} db 数据库实例
 * @param {string} roomId 房间ID
 * @param {object} finalRoomData 最终房间数据
 */
async function doSaveRecord(db, roomId, finalRoomData) {
  console.log(`[doSaveRecord] 开始保存记录: ${roomId}`);
  
  try {
    const { _id, created_at, config, game_state, players, timeline, hidden_timeline } = finalRoomData;
    // 关键修复：使用游戏开始时间而不是房间创建时间来生成记录ID，防止同一房间多次对局记录被覆盖
    const startTime = game_state.start_time || created_at;
    const recordId = `${_id}_${new Date(startTime).getTime()}`;

    // 合并时间线
    const fullTimeline = [...(timeline || []), ...(hidden_timeline || [])]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 构建记录
    const record = {
      roomId: finalRoomData.roomId || roomId,
      record_date: new Date(),
      game_start_time: startTime,
      winner: game_state.winner,
      config,
      players: players.map(p => ({
        seat: p.seat,
        nickname: p.nickname,
        openid: p.openid,
        avatar_url: p.avatar_url,
        role: p.role,
        is_alive: p.is_alive,
        death_reason: p.death_reason
      })),
      player_openids: [
        finalRoomData._openid,
        ...players.map(p => p.openid).filter(o => o)
      ].filter((id, index, arr) => id && arr.indexOf(id) === index), // 去重
      timeline: fullTimeline,
      voting_history: game_state.voting_history || finalRoomData.voting_history || []
    };

    // 使用重试机制保存
    await withRetry(async () => {
      await db.collection('game_records').doc(recordId).set(record);
    });

    console.log(`[doSaveRecord] 记录保存成功: ${recordId}`);
  } catch (e) {
    console.error('[doSaveRecord] 保存记录失败:', e);
  }
}

// ==========================================
// 游戏逻辑
// ==========================================

/**
 * 检查游戏胜负
 * 使用模块化的胜负判定器
 */
function checkWinner(players, lovers = []) {
  const result = winnerChecker.checkWinner(players, lovers);
  
  if (result) {
    const { wolfCount, godCount, villagerCount, alive } = 
      winnerChecker.getFactionStats(players);
    console.log(`[checkWinner] 存活: ${alive}, 狼人: ${wolfCount}, 神职: ${godCount}, 村民: ${villagerCount}`);
  }
  
  return result;
}

// ==========================================
// 内容安全
// ==========================================

/**
 * 内容安全检查
 * @param {object} cloud 云实例
 * @param {string} text 待检查文本
 * @returns {Promise<boolean>} 是否安全
 */
async function checkContentSecurity(cloud, text) {
  if (!text || text.trim().length === 0) {
    return true;
  }

  try {
    const result = await cloud.openapi.security.msgSecCheck({
      content: text,
      version: 2,
      scene: 1,
      openid: cloud.getWXContext().OPENID
    });
    
    // 使用最保守的属性访问方式，防止环境不兼容 ?. 操作符
    if (result && result.result && result.result.suggest) {
      return result.result.suggest === 'pass';
    }
    if (result && result.suggest) {
      return result.suggest === 'pass';
    }
    return true; // 结构异常时默认通过
  } catch (err) {
    console.error('[checkContentSecurity] 检查异常:', err);
    return true; // 异常时默认放行
  }
}

// ==========================================
// 音频处理
// ==========================================

/**
 * 获取音频队列
 * @param {object} gs 当前游戏状态
 * @param {object} lgs 上一次游戏状态
 * @returns {Array|null} 音频key数组
 */
function getAudioQueue(gs, lgs) {
  if (!gs) return null;

  const { phase: p, sub_phase: sp, status: st } = gs.game_state;
  
  // 如果阶段没有变化，不播放
  if (lgs && p === lgs.game_state.phase && sp === lgs.game_state.sub_phase) {
    return null;
  }

  const keys = [];

  // 1. 处理退出音频 (从上一个阶段带过来的 "闭眼" 音频)
  if (lgs) {
    const prevSp = lgs.game_state.sub_phase;
    const prevCfg = flowConfig[prevSp];
    if (prevCfg?.getExitAudio) {
      const exitKeys = prevCfg.getExitAudio(lgs.game_state);
      if (exitKeys) keys.push(...exitKeys);
    }
  }

  // 2. 游戏结束
  if (st === 'finished' && lgs?.game_state.status !== 'finished') {
    const winner = gs.game_state.winner;
    const winKey = winner === 'good' ? 'VILLAGER_WIN' :
      winner === 'werewolf' ? 'WOLF_WIN' : 'THIRD_PARTY_WIN';
    keys.push('GAME_OVER', winKey);
    return keys;
  }

  // 3. 从配置获取当前阶段音频
  let cfg = flowConfig[sp] || flowConfig[p];
  
  if (cfg?.getAudio) {
    const phKeys = cfg.getAudio(gs.game_state);
    if (phKeys) keys.push(...phKeys);
  }

  return keys.length > 0 ? keys : null;
}

// ==========================================
// 数据校验
// ==========================================

/**
 * 验证房间数据完整性
 * @param {object} roomDoc 房间文档
 * @returns {object} {valid, errors}
 */
function validateRoomData(roomDoc) {
  const errors = [];

  if (!roomDoc.roomId) {
    errors.push('缺少房间ID');
  }

  if (!roomDoc.players || !Array.isArray(roomDoc.players)) {
    errors.push('玩家数据格式错误');
  } else {
    const seats = roomDoc.players.map(p => p.seat);
    const uniqueSeats = new Set(seats);
    if (seats.length !== uniqueSeats.size) {
      errors.push('座位号重复');
    }
  }

  if (!roomDoc.game_state) {
    errors.push('缺少游戏状态');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 验证玩家行动
 * @param {object} action 行动数据
 * @param {object} roomDoc 房间文档
 * @param {string} openid 玩家openid
 * @returns {object} {valid, error}
 */
function validatePlayerAction(action, roomDoc, openid) {
  const player = roomDoc.players.find(p => p.openid === openid);
  
  if (!player) {
    return { valid: false, error: '玩家不在房间中' };
  }

  if (!player.is_alive) {
    return { valid: false, error: '玩家已死亡' };
  }

  const gs = roomDoc.game_state;
  const instruction = gs.current_instruction;

  // 检查是否是该玩家的回合
  if (instruction?.roleRequired) {
    const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];
    
    if (instruction.roleRequired === 'werewolf') {
      if (!WOLF_ROLES.includes(player.role)) {
        return { valid: false, error: '不是你的回合' };
      }
    } else if (player.role !== instruction.roleRequired) {
      return { valid: false, error: '不是你的回合' };
    }
  }

  return { valid: true, error: null };
}

module.exports = {
  applyUpdates,
  batchQuery,
  withRetry,
  doSaveRecord,
  checkWinner,
  checkContentSecurity,
  getAudioQueue,
  validateRoomData,
  validatePlayerAction
};
