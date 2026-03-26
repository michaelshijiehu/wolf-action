const AUDIO_KEYS = {
  DIED_IN_BLOOD: 'DIED_IN_BLOOD',
  SAFE_NIGHT: 'SAFE_NIGHT',
  YESTERDAY_NIGHT: 'YESTERDAY_NIGHT',
  GAME_OVER: 'GAME_OVER',
  WOLF_WIN: 'WOLF_WIN',
  VILLAGER_WIN: 'VILLAGER_WIN',
  THIRD_PARTY_WIN: 'THIRD_PARTY_WIN',
  EYES_CLOSE: 'EYES_CLOSE',
  EYES_OPEN: 'EYES_OPEN',
  WELCOME: 'WELCOME',
  DEAL_CARDS: 'DEAL_CARDS',
  DAWN: 'DAWN',
  DARK: 'DARK',
  GAME_START_FULL: 'GAME_START_FULL',
  DARK_FULL: 'DARK_FULL',
  DAWN_FULL: 'DAWN_FULL',
  CUPID_WAKE: 'CUPID_WAKE',
  CUPID_OPERATE: 'CUPID_OPERATE',
  CUPID_SLEEP: 'CUPID_SLEEP',
  LOVER_WAKE: 'LOVER_WAKE',
  LOVER_END: 'LOVER_END',
  GUARD_WAKE: 'GUARD_WAKE',
  GUARD_OPERATE: 'GUARD_OPERATE',
  GUARD_SLEEP: 'GUARD_SLEEP',
  WEREWOLF_WAKE: 'WEREWOLF_WAKE',
  WEREWOLF_OPERATE: 'WEREWOLF_OPERATE',
  WEREWOLF_SLEEP: 'WEREWOLF_SLEEP',
  WITCH_WAKE: 'WITCH_WAKE',
  WITCH_OPERATE: 'WITCH_OPERATE',
  WITCH_SLEEP: 'WITCH_SLEEP',
  SEER_WAKE: 'SEER_WAKE',
  SEER_OPERATE: 'SEER_OPERATE',
  SEER_SLEEP: 'SEER_SLEEP',
  HUNTER_WAKE: 'HUNTER_WAKE',
  HUNTER_OPERATE: 'HUNTER_OPERATE',
  HUNTER_SLEEP: 'HUNTER_SLEEP',
  ELECTION_START: 'ELECTION_START',
  ELECTED: 'ELECTED',
  SPEECH_START: 'SPEECH_START',
  VOTE_START_SHERIFF: 'VOTE_START_SHERIFF',
  VOTE_START_EXILE: 'VOTE_START_EXILE',
  DISCUSSION_START: 'DISCUSSION_START',
  LEAVE_SPEECH: 'LEAVE_SPEECH',
  HUNTER_ACTION: 'HUNTER_ACTION',
  HANDOVER_BADGE: 'HANDOVER_BADGE',
  PK_START: 'PK_START',
  ANNOUNCE_DEATH: (deadSeats) => {
    if (!deadSeats || deadSeats.length === 0) return ['SAFE_NIGHT'];
    const keys = ['YESTERDAY_NIGHT'];
    const uniqueSeats = [...new Set(deadSeats)].sort((a, b) => a - b);
    uniqueSeats.forEach(seat => { keys.push(`PLAYER_${seat}`); });
    keys.push('DIED_IN_BLOOD');
    return keys;
  }
};

const GAME_PHASES = {
  READY: 'ready',
  GAME_WELCOME: 'game_welcome',
  DEAL_CARDS: 'deal_cards',
  NIGHT_START: 'night_start',
  
  // Consolidated Night Phases
  WILD_CHILD_PHASE: 'wild_child_phase',
  CUPID_PHASE: 'cupid_phase',
  LOVER_PHASE: 'lover_phase',
  GUARD_PHASE: 'guard_phase',
  MAGICIAN_PHASE: 'magician_phase',
  DREAM_CATCHER_PHASE: 'dream_catcher_phase',
  WEREWOLF_PHASE: 'werewolf_phase',
  WOLF_BEAUTY_PHASE: 'wolf_beauty_phase',
  GARGOYLE_PHASE: 'gargoyle_phase',
  WITCH_PHASE: 'witch_phase',
  MERCHANT_PHASE: 'merchant_phase',
  SILENCER_PHASE: 'silencer_phase',
  SEER_PHASE: 'seer_phase',
  GRAVEKEEPER_PHASE: 'gravekeeper_phase',
  HUNTER_PHASE: 'hunter_phase',

  CALCULATE_DEATH: 'calculate_death',
  DAY_ANNOUNCE: 'day_announce',
  DAY_DAWN: 'day_dawn',
  DISCUSSION: 'discussion',
  VOTING: 'voting',
  LEAVE_SPEECH: 'leave_speech',
  SHERIFF_NOMINATION: 'sheriff_nomination',
  SHERIFF_SPEECH: 'sheriff_speech',
  SHERIFF_VOTING: 'sheriff_voting',
  SHERIFF_PK_SPEECH: 'sheriff_pk_speech',
  SHERIFF_PK_VOTING: 'sheriff_pk_voting',
  ELECTION_ANNOUNCE: 'election_announce',
  HUNTER_ACTION: 'hunter_action',
  SHERIFF_HANDOVER: 'sheriff_handover',
  DAY_PK: 'day_pk',
  PK_VOTING: 'pk_voting',
  EXILE_ANNOUNCE: 'exile_announce'
};

const flowConfig = {
  [GAME_PHASES.READY]: { next: GAME_PHASES.GAME_WELCOME, env: 'day', duration: 0 },
  [GAME_PHASES.GAME_WELCOME]: {
    next: GAME_PHASES.DEAL_CARDS, env: 'day', duration: 5, auto_proceed: true,
    getAudio: () => ['WELCOME'],
    ui: { title: '🎉 欢迎参与', tips: '游戏即将开始', actionBtn: '准备好了', color: '#ffec3d', actionPanel: 'none', brightness: 0.7 }
  },
  [GAME_PHASES.DEAL_CARDS]: {
    next: GAME_PHASES.NIGHT_START, env: 'day', duration: 20, auto_proceed: true,
    getAudio: () => ['DEAL_CARDS'],
    ui: { title: '🎴 发放身份', tips: '请确认您的身份牌(全员确认后自动入夜)', actionBtn: '确认身份', color: '#ffa940', actionPanel: 'none', brightness: 0.7 }
  },
  [GAME_PHASES.NIGHT_START]: {
    next: GAME_PHASES.WILD_CHILD_PHASE, env: 'night', duration: 5, auto_proceed: true,
    getAudio: (gs) => gs.day_count === 1 ? ['GAME_START_FULL'] : ['DARK_FULL'],
    ui: { title: '🌙 入夜准备', tips: '天黑请闭眼', actionBtn: '立即入夜', color: '#8c8c8c', actionPanel: 'none', brightness: 0.7 }
  },
  
  [GAME_PHASES.WILD_CHILD_PHASE]: {
    next: GAME_PHASES.CUPID_PHASE, env: 'night', roleRequired: 'wild_child', firstNightOnly: true, duration: 15, allowAction: ['wild_child'], auto_proceed: true,
    getAudio: () => ['WILD_CHILD_WAKE', 'WILD_CHILD_OPERATE'],
    getExitAudio: () => ['WILD_CHILD_SLEEP'],
    ui: { title: '野孩子行动', tips: '请选择榜样', color: '#722ed1', actionPanel: 'wild_child', brightness: 0.6 }
  },
  [GAME_PHASES.CUPID_PHASE]: {
    next: GAME_PHASES.LOVER_PHASE, env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 15, allowAction: ['cupid'], auto_proceed: true,
    getAudio: () => ['CUPID_WAKE', 'CUPID_OPERATE'],
    getExitAudio: () => ['CUPID_SLEEP'],
    ui: { title: '丘比特行动', tips: '请连接情侣', color: '#ff85c0', actionPanel: 'cupid', brightness: 0.6 }
  },
  [GAME_PHASES.LOVER_PHASE]: {
    next: GAME_PHASES.GUARD_PHASE, env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 10, auto_proceed: false,
    getAudio: () => ['LOVER_WAKE'],
    getExitAudio: () => ['LOVER_END'],
    ui: { title: '情侣确认', tips: '确认你的另一半', actionBtn: '我知道了', color: '#ff4d4f', actionPanel: 'lover_confirm', brightness: 0.6 }
  },
  [GAME_PHASES.GUARD_PHASE]: {
    next: GAME_PHASES.MAGICIAN_PHASE, env: 'night', roleRequired: 'guard', duration: 15, allowAction: ['guard'], auto_proceed: true,
    getAudio: () => ['GUARD_WAKE', 'GUARD_OPERATE'],
    getExitAudio: () => ['GUARD_SLEEP'],
    ui: { title: '守卫行动', tips: '请选择目标', color: '#52c41a', actionPanel: 'guard', brightness: 0.6 }
  },
  [GAME_PHASES.MAGICIAN_PHASE]: {
    next: GAME_PHASES.DREAM_CATCHER_PHASE, env: 'night', roleRequired: 'magician', duration: 15, allowAction: ['magician'], auto_proceed: true,
    getAudio: () => ['MAGICIAN_WAKE', 'MAGICIAN_OPERATE'],
    getExitAudio: () => ['MAGICIAN_SLEEP'],
    ui: { title: '魔术师行动', tips: '请交换号码', color: '#13c2c2', actionPanel: 'magician', brightness: 0.6 }
  },
  [GAME_PHASES.DREAM_CATCHER_PHASE]: {
    next: GAME_PHASES.WEREWOLF_PHASE, env: 'night', roleRequired: 'dream_catcher', duration: 15, allowAction: ['dream_catcher'], auto_proceed: true,
    getAudio: () => ['DREAM_CATCHER_WAKE', 'DREAM_CATCHER_OPERATE'],
    getExitAudio: () => ['DREAM_CATCHER_SLEEP'],
    ui: { title: '摄梦人行动', tips: '请选择', color: '#eb2f96', actionPanel: 'dream_catcher', brightness: 0.6 }
  },
  [GAME_PHASES.WEREWOLF_PHASE]: {
    next: GAME_PHASES.WOLF_BEAUTY_PHASE, env: 'night', roleRequired: 'werewolf', duration: 50, allowAction: ['werewolf'], auto_proceed: false,
    getAudio: () => ['WEREWOLF_WAKE', 'WEREWOLF_OPERATE'],
    getExitAudio: () => ['WEREWOLF_SLEEP'],
    ui: { title: '狼人行动', tips: '请选择目标并点击确定', color: '#ff4d4f', actionPanel: 'werewolf', brightness: 0.6 }
  },
  [GAME_PHASES.WOLF_BEAUTY_PHASE]: {
    next: GAME_PHASES.GARGOYLE_PHASE, env: 'night', roleRequired: 'wolf_beauty', duration: 15, allowAction: ['wolf_beauty'], auto_proceed: true,
    getAudio: () => ['WOLF_BEAUTY_WAKE', 'WOLF_BEAUTY_OPERATE'],
    getExitAudio: () => ['WOLF_BEAUTY_SLEEP'],
    ui: { title: '狼美人行动', tips: '请魅惑', color: '#f5222d', actionPanel: 'wolf_beauty', brightness: 0.6 }
  },
  [GAME_PHASES.GARGOYLE_PHASE]: {
    next: GAME_PHASES.WITCH_PHASE, env: 'night', roleRequired: 'gargoyle', duration: 15, allowAction: ['gargoyle'], auto_proceed: true,
    getAudio: () => ['GARGOYLE_WAKE', 'GARGOYLE_OPERATE'],
    getExitAudio: () => ['GARGOYLE_SLEEP'],
    ui: { title: '石像鬼行动', tips: '请查验', color: '#595959', actionPanel: 'gargoyle', brightness: 0.6 }
  },
  [GAME_PHASES.WITCH_PHASE]: {
    next: GAME_PHASES.MERCHANT_PHASE, env: 'night', roleRequired: 'witch', duration: 20, allowAction: ['witch'], auto_proceed: true,
    getAudio: () => ['WITCH_WAKE', 'WITCH_OPERATE'],
    getExitAudio: () => ['WITCH_SLEEP'],
    ui: { title: '女巫行动', tips: '请用药', color: '#722ed1', actionBtn: '跳过', actionPanel: 'witch', brightness: 0.6 }
  },
  [GAME_PHASES.MERCHANT_PHASE]: {
    next: GAME_PHASES.SILENCER_PHASE, env: 'night', roleRequired: 'merchant', duration: 15, allowAction: ['merchant'], auto_proceed: true,
    getAudio: () => ['MERCHANT_WAKE', 'MERCHANT_OPERATE'],
    getExitAudio: () => ['MERCHANT_SLEEP'],
    ui: { title: '黑商行动', tips: '请交易', color: '#faad14', actionPanel: 'merchant', brightness: 0.6 }
  },
  [GAME_PHASES.SILENCER_PHASE]: {
    next: GAME_PHASES.SEER_PHASE, env: 'night', roleRequired: 'silencer', duration: 15, allowAction: ['silencer'], auto_proceed: true,
    getAudio: () => ['SILENCER_WAKE', 'SILENCER_OPERATE'],
    getExitAudio: () => ['SILENCER_SLEEP'],
    ui: { title: '禁言长老行动', tips: '请禁言', color: '#2f54eb', actionPanel: 'silencer', brightness: 0.6 }
  },
  [GAME_PHASES.SEER_PHASE]: {
    next: GAME_PHASES.GRAVEKEEPER_PHASE, env: 'night', roleRequired: 'seer', duration: 20, allowAction: ['seer'], auto_proceed: true,
    getAudio: () => ['SEER_WAKE', 'SEER_OPERATE'],
    getExitAudio: () => ['SEER_SLEEP'],
    ui: { title: '预言家行动', tips: '请查验一名玩家', color: '#1890ff', actionPanel: 'seer', brightness: 0.6 }
  },
  [GAME_PHASES.GRAVEKEEPER_PHASE]: {
    next: GAME_PHASES.HUNTER_PHASE, env: 'night', roleRequired: 'gravekeeper', duration: 15, allowAction: ['gravekeeper'], auto_proceed: true,
    getAudio: () => ['GRAVEKEEPER_WAKE', 'GRAVEKEEPER_OPERATE'],
    getExitAudio: () => ['GRAVEKEEPER_SLEEP'],
    ui: { title: '守墓人行动', tips: '请确认', color: '#5b8c00', actionPanel: 'gravekeeper', brightness: 0.6 }
  },
  [GAME_PHASES.HUNTER_PHASE]: {
    next: GAME_PHASES.DAY_ANNOUNCE, env: 'night', roleRequired: 'hunter', duration: 15, allowAction: ['hunter'], auto_proceed: false,
    getAudio: () => ['HUNTER_WAKE', 'HUNTER_OPERATE'],
    getExitAudio: () => ['HUNTER_SLEEP'],
    ui: { title: '猎人确认', tips: '请确认状态', actionBtn: '确定', color: '#fa8c16', actionPanel: 'hunter_confirm', brightness: 0.6 }
  },
  [GAME_PHASES.DAY_ANNOUNCE]: {
    next: null, env: 'day', duration: 3, auto_proceed: true,
    getAudio: () => ['DAWN'],
    ui: { title: '天亮了', tips: '等待结算...', color: '#ffd700', actionPanel: 'none' }
  },
  [GAME_PHASES.DAY_DAWN]: {
    next: GAME_PHASES.DISCUSSION, env: 'day', duration: 12, auto_proceed: true,
    getAudio: (gs) => AUDIO_KEYS.ANNOUNCE_DEATH((gs.last_night_deaths || []).map(d => d.seat)),
    ui: { title: '揭晓死讯', tips: '正在结算...', color: '#ffd700', actionPanel: 'none' }
  },
  [GAME_PHASES.DISCUSSION]: {
    next: GAME_PHASES.VOTING, env: 'day', duration: 500, auto_proceed: true,
    getAudio: () => ['DISCUSSION_START'],
    ui: { title: '自由讨论', tips: '请按顺序发言', actionBtn: '结束发言', color: '#52c41a', actionPanel: 'none' }
  },
  [GAME_PHASES.VOTING]: {
    next: GAME_PHASES.EXILE_ANNOUNCE, env: 'day', duration: 20, allowAction: ['all'], auto_proceed: false,
    getAudio: () => ['VOTE_START_EXILE'],
    ui: { title: '放逐投票', tips: '请点击头像投票', actionBtn: '弃票', color: '#ff4d4f', actionPanel: 'vote_exile' }
  },
  [GAME_PHASES.LEAVE_SPEECH]: {
    next: GAME_PHASES.NIGHT_START, env: 'day', duration: 55, auto_proceed: true,
    getAudio: () => ['LEAVE_SPEECH'],
    ui: { title: '发表遗言', tips: '请被放逐玩家发表遗言', actionBtn: '结束发言', color: '#722ed1', actionPanel: 'none' }
  },
  [GAME_PHASES.SHERIFF_NOMINATION]: {
    next: GAME_PHASES.SHERIFF_SPEECH, env: 'day', duration: 20, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['ELECTION_START'],
    ui: { title: '警长竞选', tips: '想要上警的请举手', actionBtn: '结束报名', color: '#ffd700', actionPanel: 'sheriff_nomination' }
  },
  [GAME_PHASES.SHERIFF_SPEECH]: {
    next: GAME_PHASES.SHERIFF_VOTING, env: 'day', duration: 100, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['SPEECH_START'],
    ui: { title: '竞选发言', tips: '竞选人发言中（点击头像可退水）', actionBtn: '进入投票', color: '#ffd700', actionPanel: 'sheriff_election' }
  },
  [GAME_PHASES.SHERIFF_PK_VOTING]: {
    next: GAME_PHASES.ELECTION_ANNOUNCE, env: 'day', duration: 15, allowAction: ['all'], auto_proceed: false,
    getAudio: () => ['VOTE_START_SHERIFF'],
    ui: { title: 'PK投票', tips: '请对PK玩家投票', actionBtn: '弃票', color: '#ffd700', actionPanel: 'vote_sheriff' }
  },
  [GAME_PHASES.SHERIFF_PK_SPEECH]: {
    next: GAME_PHASES.SHERIFF_PK_VOTING, env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['PK_START'],
    ui: { title: 'PK发言', tips: '平票玩家请轮流发言', actionBtn: '结束发言', color: '#fa541c', actionPanel: 'none' }
  },
  [GAME_PHASES.ELECTION_ANNOUNCE]: {
    next: GAME_PHASES.DAY_DAWN, env: 'day', duration: 10, auto_proceed: true,
    getAudio: (gs) => {
      if (gs.election_result === 'tie_pk') return ['TIE_PK'];
      if (gs.election_result === 'tie') return ['TIE_RE_VOTE'];
      if (gs.election_result === 'elected' && gs.sheriff_seat) { return [`PLAYER_${gs.sheriff_seat}`, 'ELECTED']; }
      return ['ELECTED'];
    },
    ui: { title: '竞选结果', tips: '正在公布...', color: '#ffd700', actionPanel: 'none' }
  },
  [GAME_PHASES.HUNTER_ACTION]: {
    next: GAME_PHASES.DISCUSSION, env: 'day', duration: 15, allowAction: ['hunter'], auto_proceed: true,
    getAudio: () => ['HUNTER_ACTION'],
    ui: { title: '猎人行动', tips: '请带走一名玩家', actionBtn: '不开枪', color: '#fa8c16', actionPanel: 'hunter_action' }
  },
  [GAME_PHASES.SHERIFF_HANDOVER]: {
    next: GAME_PHASES.DISCUSSION, env: 'day', duration: 15, allowAction: ['sheriff'], auto_proceed: true,
    getAudio: () => ['HANDOVER_BADGE'],
    ui: { title: '移交警徽', tips: '请选择一名玩家移交警徽，或选择撕毁', actionBtn: '撕毁', color: '#ffd700', actionPanel: 'sheriff_handover' }
  },
  [GAME_PHASES.DAY_PK]: {
    next: GAME_PHASES.PK_VOTING, env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['PK_START'],
    ui: { title: 'PK发言', tips: '平票玩家请轮流发言', actionBtn: '结束发言', color: '#fa541c', actionPanel: 'none' }
  },
  [GAME_PHASES.PK_VOTING]: {
    next: GAME_PHASES.EXILE_ANNOUNCE, env: 'day', duration: 20, allowAction: ['all'], auto_proceed: false,
    getAudio: () => ['VOTE_START_EXILE'],
    ui: { title: 'PK投票', tips: '请在PK位中选择', actionBtn: '弃票', color: '#ff4d4f', actionPanel: 'pk_voting' }
  },
  [GAME_PHASES.EXILE_ANNOUNCE]: {
    next: GAME_PHASES.LEAVE_SPEECH, env: 'day', duration: 8, auto_proceed: true,
    getAudio: (gs) => {
      if (gs.exile_result === 'tie') return ['TIE_PK'];
      if (gs.exile_result === 'out' && gs.exile_seat) { return [`PLAYER_${gs.exile_seat}`, 'BE_EXILED']; }
      return ['BE_EXILED'];
    },
    ui: { title: '投票结果', tips: '正在公布...', color: '#ff4d4f', actionPanel: 'none' }
  },
};

const ROLE_PHASES = {
  WEREWOLF_ACTION: 'werewolf_action',
  WITCH_ACTION: 'witch_action',
  SEER_ACTION: 'seer_action',
  GUARD_ACTION: 'guard_action',
  CUPID_ACTION: 'cupid_action',
  MAGICIAN_ACTION: 'magician_action',
  DREAM_CATCHER_ACTION: 'dream_catcher_action',
  WOLF_BEAUTY_ACTION: 'wolf_beauty_action',
  GARGOYLE_ACTION: 'gargoyle_action',
  MERCHANT_ACTION: 'merchant_action',
  SILENCER_ACTION: 'silencer_action',
  WILD_CHILD_ACTION: 'wild_child_action',
  HUNTER_ACTION: 'hunter_action',
  SHERIFF_NOMINATION: 'sheriff_nomination',
  SHERIFF_VOTING: 'sheriff_voting',
  DAY_VOTING: 'day_voting',
  SHERIFF_HANDOVER: 'sheriff_handover'
};

const { ROLES_CONFIG } = require('./config/rolesConfig');
const ROLES = {};
Object.keys(ROLES_CONFIG).forEach(key => {
  ROLES[key.toUpperCase()] = key;
});
ROLES.UNKNOWN = 'unknown';

module.exports = { AUDIO_KEYS, flowConfig, GAME_PHASES, ROLE_PHASES, ROLES };
