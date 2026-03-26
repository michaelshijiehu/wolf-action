/**
 * 死亡计算模块
 * 处理夜晚死亡结算的所有逻辑
 */

const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];

/**
 * 获取狼人击杀目标
 * @param {object} werewolfVotes 狼人投票记录
 * @returns {number|null} 击杀目标座位号
 */
function getWolfKillTarget(werewolfVotes) {
  const counts = {};
  Object.values(werewolfVotes || {}).forEach(v => {
    counts[v] = (counts[v] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? Number(sorted[0][0]) : null;
}

/**
 * 魔术师交换 - 获取有效目标
 * @param {number} seat 原始座位号
 * @param {Array} exchange 魔术师交换对 [seatA, seatB]
 * @returns {number} 有效目标座位号
 */
function getEffectiveTarget(seat, exchange = []) {
  if (exchange.length === 2) {
    if (seat === exchange[0]) return exchange[1];
    if (seat === exchange[1]) return exchange[0];
  }
  return seat;
}

/**
 * 计算夜晚死亡
 * @param {object} params 参数对象
 * @param {Array} params.players 玩家列表
 * @param {object} params.actions 本轮行动
 * @param {object} params.gameState 游戏状态
 * @returns {Array} 死亡列表 [{seat, reason}]
 */
function calculateNightDeaths({ players, actions, gameState }) {
  const deaths = [];
  const {
    werewolf_votes = {},
    witch_action = {},
    guard_protect,
    magician_exchange = [],
    dream_catcher_sleep,
    merchant_trade,
    merchant_item,
    wolf_beauty_charm
  } = actions;

  const { last_dream_catcher_target, lovers = [] } = gameState;

  // 获取各角色的目标
  const wolfKillOriginal = getWolfKillTarget(werewolf_votes);
  const wolfKill = wolfKillOriginal ? getEffectiveTarget(wolfKillOriginal, magician_exchange) : null;

  const witchPoisonOriginal = witch_action.poison_target ? Number(witch_action.poison_target) : null;
  const witchPoison = witchPoisonOriginal ? getEffectiveTarget(witchPoisonOriginal, magician_exchange) : null;

  const guardProtectOriginal = guard_protect ? Number(guard_protect) : null;
  const guardProtect = guardProtectOriginal ? getEffectiveTarget(guardProtectOriginal, magician_exchange) : null;

  const witchSave = witch_action.save ? wolfKill : null;

  const dreamTarget = dream_catcher_sleep ? Number(dream_catcher_sleep) : null;
  const merchantTarget = merchant_trade ? Number(merchant_trade) : null;
  const shroudTarget = merchant_item === 'shroud' ? merchantTarget : null;

  // 检查玩家是否存活
  const isAlive = (seat) => {
    const p = players.find(pl => pl.seat === seat);
    return p && p.is_alive;
  };

  // 检查是否被摄梦保护
  const isProtectedByDream = (seat) => dreamTarget && seat === dreamTarget;

  // 1. 狼人击杀
  if (wolfKill && isAlive(wolfKill)) {
    // 商人披风阻挡
    if (shroudTarget && wolfKill === shroudTarget) {
      // 披风生效，不死亡
    }
    // 女巫解药 + 守卫守护 同守 = 同归于尽
    else if (wolfKill === witchSave && wolfKill === guardProtect) {
      deaths.push({ seat: wolfKill, reason: 'milk_guard_clash' });
    }
    // 正常击杀（未被救、未被守）
    else if (wolfKill !== witchSave && wolfKill !== guardProtect) {
      if (!isProtectedByDream(wolfKill)) {
        deaths.push({ seat: wolfKill, reason: 'werewolf_kill' });
      }
    }
  }

  // 2. 女巫毒杀
  if (witchPoison && isAlive(witchPoison)) {
    if (!isProtectedByDream(witchPoison)) {
      deaths.push({ seat: witchPoison, reason: 'witch_poison' });
    }
  }

  // 3. 商人毒药
  if (merchant_item === 'poison' && merchantTarget && isAlive(merchantTarget)) {
    if (!deaths.some(d => d.seat === merchantTarget)) {
      if (!isProtectedByDream(merchantTarget)) {
        deaths.push({ seat: merchantTarget, reason: 'merchant_poison' });
      }
    }
  }

  // 4. 商人幸运卡 - 移除一个死亡
  if (merchant_item === 'lucky_card' && merchantTarget) {
    const idx = deaths.findIndex(d => d.seat === merchantTarget);
    if (idx > -1) deaths.splice(idx, 1);
  }

  // 5. 摄梦人特殊规则
  // 连续两晚摄同一人 = 该人死亡
  if (dreamTarget && last_dream_catcher_target && dreamTarget === last_dream_catcher_target) {
    if (isAlive(dreamTarget) && !deaths.some(d => d.seat === dreamTarget)) {
      deaths.push({ seat: dreamTarget, reason: 'dream_catcher_repeat' });
    }
  }

  // 摄梦人死亡 = 梦中人陪葬
  const dreamCatcher = players.find(p => p.role === 'dream_catcher');
  if (dreamCatcher && deaths.some(d => d.seat === dreamCatcher.seat) && dreamTarget) {
    if (isAlive(dreamTarget) && !deaths.some(d => d.seat === dreamTarget)) {
      deaths.push({ seat: dreamTarget, reason: 'dream_catcher_link' });
    }
  }

  // 6. 狼美人殉情
  const deadSeatsPre = deaths.map(d => d.seat);
  const wolfBeauty = players.find(p => p.role === 'wolf_beauty');
  if (wolfBeauty && deadSeatsPre.includes(wolfBeauty.seat) && wolf_beauty_charm) {
    const charmTarget = Number(wolf_beauty_charm);
    if (isAlive(charmTarget) && !deadSeatsPre.includes(charmTarget)) {
      deaths.push({ seat: charmTarget, reason: 'wolf_beauty_charm' });
    }
  }

  // 7. 情侣殉情
  if (lovers.length === 2) {
    const currentDeadSeats = deaths.map(d => d.seat);
    lovers.forEach(seat => {
      if (currentDeadSeats.includes(seat)) {
        const other = lovers.find(s => s !== seat);
        if (isAlive(other) && !deaths.some(d => d.seat === other)) {
          deaths.push({ seat: other, reason: 'lover' });
        }
      }
    });
  }

  return deaths;
}

/**
 * 处理野孩子变身
 * @param {Array} players 玩家列表
 * @param {Array} deaths 死亡列表
 * @param {function} log 日志函数
 * @returns {object|null} 更新对象
 */
function handleWildChildTransformation(players, deaths, log) {
  const allDeadSeats = deaths.map(d => d.seat);
  const wildChild = players.find(p => p.role === 'wild_child');

  if (wildChild && wildChild.is_alive && wildChild.role_state?.model_seat) {
    if (allDeadSeats.includes(wildChild.role_state.model_seat)) {
      const wcIdx = players.findIndex(p => p.role === 'wild_child');
      if (wcIdx > -1) {
        log && log('野孩子榜样死亡，已加入狼人阵营');
        return { [`players.${wcIdx}.role_state.is_wolf_side`]: true };
      }
    }
  }
  return null;
}

module.exports = {
  calculateNightDeaths,
  getWolfKillTarget,
  getEffectiveTarget,
  handleWildChildTransformation,
  WOLF_ROLES
};
