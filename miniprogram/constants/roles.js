/**
 * 角色相关常量定义
 * 统一管理所有游戏角色的配置信息
 */

// 角色名称映射
const ROLE_NAMES = {
  werewolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  idiot: '白痴',
  guard: '守卫',
  cupid: '丘比特',
  knight: '骑士',
  bear: '熊',
  merchant: '黑商',
  silencer: '禁言长老',
  gravekeeper: '守墓人',
  magician: '魔术师',
  dream_catcher: '摄梦人',
  wolf_king: '白狼王',
  wolf_beauty: '狼美人',
  hidden_wolf: '隐狼',
  gargoyle: '石像鬼',
  wild_child: '野孩子',
  unknown: '隐藏'
};

// 角色阵营
const ROLE_FACTIONS = {
  // 狼人阵营
  werewolf: 'wolf',
  wolf_king: 'wolf',
  wolf_beauty: 'wolf',
  hidden_wolf: 'wolf',
  gargoyle: 'wolf',
  // 好人阵营
  villager: 'good',
  seer: 'good',
  witch: 'good',
  hunter: 'good',
  idiot: 'good',
  guard: 'good',
  cupid: 'good',
  merchant: 'good',
  silencer: 'good',
  gravekeeper: 'good',
  magician: 'good',
  dream_catcher: 'good',
  // 特殊角色
  wild_child: 'neutral'
};

// 狼人角色列表
const WOLF_ROLES = ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'];

// 神职角色列表
const GOD_ROLES = ['seer', 'witch', 'hunter', 'idiot', 'guard', 'cupid', 'merchant', 'silencer', 'gravekeeper', 'magician', 'dream_catcher'];

// 角色简写映射（用于显示）
const ROLE_SHORT_NAMES = {
  seer: '预',
  witch: '女',
  hunter: '猎',
  idiot: '白',
  guard: '守',
  cupid: '丘',
  merchant: '商',
  silencer: '禁',
  gravekeeper: '墓',
  magician: '魔',
  dream_catcher: '摄',
  wolf_king: '王',
  wolf_beauty: '美',
  hidden_wolf: '隐',
  gargoyle: '石',
  wild_child: '野'
};

// 默认角色状态
const DEFAULT_ROLE_STATE = {
  witch_poison_used: false,
  witch_save_used: false,
  hunter_shoot_used: false,
  hunter_status: 'can_shoot',
  guard_last_protected_seat: null,
  idiot_revealed: false,
  model_seat: null,
  merchant_item: null,
  silencer_last_silenced: null,
  magician_exchanged: [],
  dream_catcher_target: null,
  wolf_beauty_target: null,
  gargoyle_check_history: []
};

/**
 * 获取角色名称
 * @param {string} roleKey 角色key
 * @returns {string} 角色中文名
 */
function getRoleName(roleKey) {
  return ROLE_NAMES[roleKey] || '未知';
}

/**
 * 获取角色阵营
 * @param {string} roleKey 角色key
 * @returns {string} 阵营 (wolf/good/neutral)
 */
function getRoleFaction(roleKey) {
  return ROLE_FACTIONS[roleKey] || 'unknown';
}

/**
 * 是否为狼人阵营
 * @param {string} roleKey 角色key
 * @returns {boolean}
 */
function isWolfRole(roleKey) {
  return WOLF_ROLES.includes(roleKey);
}

/**
 * 是否为神职角色
 * @param {string} roleKey 角色key
 * @returns {boolean}
 */
function isGodRole(roleKey) {
  return GOD_ROLES.includes(roleKey);
}

/**
 * 获取角色简写
 * @param {string} roleKey 角色key
 * @returns {string} 角色简写
 */
function getRoleShortName(roleKey) {
  return ROLE_SHORT_NAMES[roleKey] || '?';
}

module.exports = {
  ROLE_NAMES,
  ROLE_FACTIONS,
  WOLF_ROLES,
  GOD_ROLES,
  ROLE_SHORT_NAMES,
  DEFAULT_ROLE_STATE,
  getRoleName,
  getRoleFaction,
  isWolfRole,
  isGodRole,
  getRoleShortName
};
