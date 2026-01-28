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

const flowConfig = {
  ready: { next: 'game_welcome', env: 'day', duration: 0 },
  game_welcome: {
    next: 'deal_cards', env: 'day', duration: 4, auto_proceed: true,
    getAudio: () => ['WELCOME'],
    ui: { title: '🎉 欢迎参与', tips: '游戏即将开始', color: '#ffec3d', actionPanel: 'none', brightness: 0.7 }
  },
  deal_cards: {
    next: 'night_start', env: 'day', duration: 10, auto_proceed: true,
    getAudio: () => ['DEAL_CARDS'],
    ui: { title: '🎴 发放身份', tips: '请确认您的身份牌', color: '#ffa940', actionPanel: 'none', brightness: 0.7 }
  },
  night_start: {
    next: 'wild_child_wake', env: 'night', duration: 8, auto_proceed: true,
    getAudio: (gs) => gs.day_count === 1 ? ['GAME_START_FULL'] : ['DARK_FULL'],
    ui: { title: '🌙 入夜准备', tips: '天黑请闭眼', color: '#8c8c8c', actionPanel: 'none', brightness: 0.7 }
  },
  wild_child_wake: {
    next: 'wild_child_action', env: 'night', roleRequired: 'wild_child', firstNightOnly: true, duration: 4, auto_proceed: true,
    getAudio: () => ['WILD_CHILD_WAKE'],
    ui: { title: '野孩子', tips: '请睁眼', actionPanel: 'wild_child', brightness: 0.1 }
  },
  wild_child_action: {
    next: 'wild_child_sleep', env: 'night', roleRequired: 'wild_child', firstNightOnly: true, duration: 20, allowAction: ['wild_child'], auto_proceed: true,
    getAudio: () => ['WILD_CHILD_OPERATE'],
    ui: { title: '野孩子行动', tips: '请选择榜样', actionBtn: '确认', color: '#722ed1', actionPanel: 'wild_child', brightness: 0.6 }
  },
  wild_child_sleep: {
    next: 'cupid_wake', env: 'night', roleRequired: 'wild_child', duration: 4, auto_proceed: true,
    getAudio: () => ['WILD_CHILD_SLEEP'],
    ui: { title: '野孩子', tips: '请闭眼', actionPanel: 'wild_child', brightness: 0.1 }
  },
  cupid_wake: {
    next: 'cupid_action', env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 4, auto_proceed: true,
    getAudio: () => ['CUPID_WAKE'],
    ui: { title: '丘比特', tips: '请睁眼', actionPanel: 'cupid', brightness: 0.1 }
  },
  cupid_action: {
    next: 'cupid_sleep', env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 25, allowAction: ['cupid'], auto_proceed: true,
    getAudio: () => ['CUPID_OPERATE'],
    ui: { title: '丘比特行动', tips: '请连接情侣', actionBtn: '确认连接', color: '#ff85c0', actionPanel: 'cupid', brightness: 0.6 }
  },
  cupid_sleep: {
    next: 'lover_wake', env: 'night', roleRequired: 'cupid', duration: 4, auto_proceed: true,
    getAudio: () => ['CUPID_SLEEP'],
    ui: { title: '丘比特', tips: '请闭眼', actionPanel: 'cupid', brightness: 0.1 }
  },
  lover_wake: {
    next: 'lover_confirm', env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 5, auto_proceed: true,
    getAudio: () => ['LOVER_WAKE'],
    ui: { title: '情侣', tips: '请睁眼', actionPanel: 'lover_confirm', brightness: 0.1 }
  },
  lover_confirm: {
    next: 'lover_sleep', env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 10, auto_proceed: true,
    ui: { title: '情侣确认', tips: '确认你的另一半', color: '#ff4d4f', actionPanel: 'lover_confirm', brightness: 0.6 }
  },
  lover_sleep: {
    next: 'guard_wake', env: 'night', roleRequired: 'cupid', duration: 4, auto_proceed: true,
    getAudio: () => ['LOVER_END'],
    ui: { title: '情侣', tips: '请闭眼', actionPanel: 'lover_confirm', brightness: 0.1 }
  },
  guard_wake: {
    next: 'guard_action', env: 'night', roleRequired: 'guard', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['GUARD_WAKE'],
    ui: { title: '守卫', tips: '请睁眼', actionPanel: 'guard', brightness: 0.1 }
  },
  guard_action: {
    next: 'guard_sleep', env: 'night', roleRequired: 'guard', checkAlive: true, duration: 20, allowAction: ['guard'], auto_proceed: true,
    getAudio: () => ['GUARD_OPERATE'],
    ui: { title: '守卫行动', tips: '请选择目标', color: '#52c41a', actionPanel: 'guard', brightness: 0.6 }
  },
  guard_sleep: {
    next: 'magician_wake', env: 'night', roleRequired: 'guard', duration: 4, auto_proceed: true,
    getAudio: () => ['GUARD_SLEEP'],
    ui: { title: '守卫', tips: '请闭眼', actionPanel: 'guard', brightness: 0.1 }
  },
  magician_wake: {
    next: 'magician_action', env: 'night', roleRequired: 'magician', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['MAGICIAN_WAKE'],
    ui: { title: '魔术师', tips: '请睁眼', actionPanel: 'magician', brightness: 0.1 }
  },
  magician_action: {
    next: 'magician_sleep', env: 'night', roleRequired: 'magician', checkAlive: true, duration: 20, allowAction: ['magician'], auto_proceed: true,
    getAudio: () => ['MAGICIAN_OPERATE'],
    ui: { title: '魔术师行动', tips: '请交换号码', color: '#13c2c2', actionPanel: 'magician', brightness: 0.6 }
  },
  magician_sleep: {
    next: 'dream_catcher_wake', env: 'night', roleRequired: 'magician', duration: 4, auto_proceed: true,
    getAudio: () => ['MAGICIAN_SLEEP'],
    ui: { title: '魔术师', tips: '请闭眼', actionPanel: 'magician', brightness: 0.1 }
  },
  dream_catcher_wake: {
    next: 'dream_catcher_action', env: 'night', roleRequired: 'dream_catcher', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['DREAM_CATCHER_WAKE'],
    ui: { title: '摄梦人', tips: '请睁眼', actionPanel: 'dream_catcher', brightness: 0.1 }
  },
  dream_catcher_action: {
    next: 'dream_catcher_sleep', env: 'night', roleRequired: 'dream_catcher', checkAlive: true, duration: 20, allowAction: ['dream_catcher'], auto_proceed: true,
    getAudio: () => ['DREAM_CATCHER_OPERATE'],
    ui: { title: '摄梦人行动', tips: '请选择', color: '#eb2f96', actionPanel: 'dream_catcher', brightness: 0.6 }
  },
  dream_catcher_sleep: {
    next: 'werewolf_wake', env: 'night', roleRequired: 'dream_catcher', duration: 4, auto_proceed: true,
    getAudio: () => ['DREAM_CATCHER_SLEEP'],
    ui: { title: '摄梦人', tips: '请闭眼', actionPanel: 'dream_catcher', brightness: 0.1 }
  },
  werewolf_wake: {
    next: 'werewolf_action', env: 'night', roleRequired: 'werewolf', duration: 4, auto_proceed: true,
    getAudio: () => ['WEREWOLF_WAKE'],
    ui: { title: '狼人', tips: '请睁眼', actionPanel: 'werewolf', brightness: 0.1 }
  },
  werewolf_action: {
    next: 'werewolf_sleep', env: 'night', roleRequired: 'werewolf', duration: 30, allowAction: ['werewolf'], auto_proceed: true,
    getAudio: () => ['WEREWOLF_OPERATE'],
    ui: { title: '狼人行动', tips: '请选择目标', color: '#ff4d4f', actionPanel: 'werewolf', brightness: 0.6 }
  },
  werewolf_sleep: {
    next: 'wolf_beauty_wake', env: 'night', roleRequired: 'werewolf', duration: 4, auto_proceed: true,
    getAudio: () => ['WEREWOLF_SLEEP'],
    ui: { title: '狼人', tips: '请闭眼', actionPanel: 'werewolf', brightness: 0.1 }
  },
  wolf_beauty_wake: {
    next: 'wolf_beauty_action', env: 'night', roleRequired: 'wolf_beauty', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['WOLF_BEAUTY_WAKE'],
    ui: { title: '狼美人', tips: '请睁眼', actionPanel: 'wolf_beauty', brightness: 0.1 }
  },
  wolf_beauty_action: {
    next: 'wolf_beauty_sleep', env: 'night', roleRequired: 'wolf_beauty', checkAlive: true, duration: 20, allowAction: ['wolf_beauty'], auto_proceed: true,
    getAudio: () => ['WOLF_BEAUTY_OPERATE'],
    ui: { title: '狼美人行动', tips: '请魅惑', color: '#f5222d', actionPanel: 'wolf_beauty', brightness: 0.6 }
  },
  wolf_beauty_sleep: {
    next: 'gargoyle_wake', env: 'night', roleRequired: 'wolf_beauty', duration: 4, auto_proceed: true,
    getAudio: () => ['WOLF_BEAUTY_SLEEP'],
    ui: { title: '狼美人', tips: '请闭眼', actionPanel: 'wolf_beauty', brightness: 0.1 }
  },
  gargoyle_wake: {
    next: 'gargoyle_action', env: 'night', roleRequired: 'gargoyle', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['GARGOYLE_WAKE'],
    ui: { title: '石像鬼', tips: '请睁眼', actionPanel: 'gargoyle', brightness: 0.1 }
  },
  gargoyle_action: {
    next: 'gargoyle_sleep', env: 'night', roleRequired: 'gargoyle', checkAlive: true, duration: 20, allowAction: ['gargoyle'], auto_proceed: true,
    getAudio: () => ['GARGOYLE_OPERATE'],
    ui: { title: '石像鬼行动', tips: '请查验', color: '#595959', actionPanel: 'gargoyle', brightness: 0.6 }
  },
  gargoyle_sleep: {
    next: 'witch_wake', env: 'night', roleRequired: 'gargoyle', duration: 4, auto_proceed: true,
    getAudio: () => ['GARGOYLE_SLEEP'],
    ui: { title: '石像鬼', tips: '请闭眼', actionPanel: 'gargoyle', brightness: 0.1 }
  },
  witch_wake: {
    next: 'witch_action', env: 'night', roleRequired: 'witch', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['WITCH_WAKE'],
    ui: { title: '女巫', tips: '请睁眼', actionPanel: 'witch', brightness: 0.1 }
  },
  witch_action: {
    next: 'witch_sleep', env: 'night', roleRequired: 'witch', checkAlive: true, duration: 25, allowAction: ['witch'], auto_proceed: true,
    getAudio: () => ['WITCH_OPERATE'],
    ui: { title: '女巫行动', tips: '请用药', color: '#722ed1', actionBtn: '跳过', actionPanel: 'witch', brightness: 0.6 }
  },
  witch_sleep: {
    next: 'merchant_wake', env: 'night', roleRequired: 'witch', duration: 4, auto_proceed: true,
    getAudio: () => ['WITCH_SLEEP'],
    ui: { title: '女巫', tips: '请闭眼', actionPanel: 'witch', brightness: 0.1 }
  },
  merchant_wake: {
    next: 'merchant_action', env: 'night', roleRequired: 'merchant', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['MERCHANT_WAKE'],
    ui: { title: '黑商', tips: '请睁眼', actionPanel: 'merchant', brightness: 0.1 }
  },
  merchant_action: {
    next: 'merchant_sleep', env: 'night', roleRequired: 'merchant', checkAlive: true, duration: 25, allowAction: ['merchant'], auto_proceed: true,
    getAudio: () => ['MERCHANT_OPERATE'],
    ui: { title: '黑商行动', tips: '请交易', color: '#faad14', actionPanel: 'merchant', brightness: 0.6 }
  },
  merchant_sleep: {
    next: 'silencer_wake', env: 'night', roleRequired: 'merchant', duration: 4, auto_proceed: true,
    getAudio: () => ['MERCHANT_SLEEP'],
    ui: { title: '黑商', tips: '请闭眼', actionPanel: 'merchant', brightness: 0.1 }
  },
  silencer_wake: {
    next: 'silencer_action', env: 'night', roleRequired: 'silencer', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['SILENCER_WAKE'],
    ui: { title: '禁言长老', tips: '请睁眼', actionPanel: 'silencer', brightness: 0.1 }
  },
  silencer_action: {
    next: 'silencer_sleep', env: 'night', roleRequired: 'silencer', checkAlive: true, duration: 20, allowAction: ['silencer'], auto_proceed: true,
    getAudio: () => ['SILENCER_OPERATE'],
    ui: { title: '禁言长老行动', tips: '请禁言', color: '#2f54eb', actionPanel: 'silencer', brightness: 0.6 }
  },
  silencer_sleep: {
    next: 'seer_wake', env: 'night', roleRequired: 'silencer', duration: 4, auto_proceed: true,
    getAudio: () => ['SILENCER_SLEEP'],
    ui: { title: '禁言长老', tips: '请闭眼', actionPanel: 'silencer', brightness: 0.1 }
  },
  seer_wake: {
    next: 'seer_action', env: 'night', roleRequired: 'seer', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['SEER_WAKE'],
    ui: { title: '预言家', tips: '请睁眼', actionPanel: 'seer', brightness: 0.1 }
  },
  seer_action: {
    next: 'seer_sleep', env: 'night', roleRequired: 'seer', checkAlive: true, duration: 20, allowAction: ['seer'], auto_proceed: true,
    getAudio: () => ['SEER_OPERATE'],
    ui: { title: '预言家行动', tips: '请查验', color: '#1890ff', actionPanel: 'seer', brightness: 0.6 }
  },
  seer_sleep: {
    next: 'gravekeeper_wake', env: 'night', roleRequired: 'seer', duration: 4, auto_proceed: true,
    getAudio: () => ['SEER_SLEEP'],
    ui: { title: '预言家', tips: '请闭眼', actionPanel: 'seer', brightness: 0.1 }
  },
  gravekeeper_wake: {
    next: 'gravekeeper_action', env: 'night', roleRequired: 'gravekeeper', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['GRAVEKEEPER_WAKE'],
    ui: { title: '守墓人', tips: '请睁眼', actionPanel: 'gravekeeper', brightness: 0.1 }
  },
  gravekeeper_action: {
    next: 'gravekeeper_sleep', env: 'night', roleRequired: 'gravekeeper', checkAlive: true, duration: 20, allowAction: ['gravekeeper'], auto_proceed: true,
    getAudio: () => ['GRAVEKEEPER_OPERATE'],
    ui: { title: '守墓人行动', tips: '请确认', color: '#5b8c00', actionPanel: 'gravekeeper', brightness: 0.6 }
  },
  gravekeeper_sleep: {
    next: 'hunter_wake', env: 'night', roleRequired: 'gravekeeper', duration: 4, auto_proceed: true,
    getAudio: () => ['GRAVEKEEPER_SLEEP'],
    ui: { title: '守墓人', tips: '请闭眼', actionPanel: 'gravekeeper', brightness: 0.1 }
  },
  hunter_wake: {
    next: 'hunter_confirm', env: 'night', roleRequired: 'hunter', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['HUNTER_WAKE'],
    ui: { title: '猎人', tips: '请睁眼', actionPanel: 'hunter_confirm', brightness: 0.1 }
  },
  hunter_confirm: {
    next: 'hunter_sleep', env: 'night', roleRequired: 'hunter', checkAlive: true, duration: 12, allowAction: ['hunter'], auto_proceed: true,
    getAudio: () => ['HUNTER_OPERATE'],
    ui: { title: '猎人确认', tips: '请确认状态', color: '#fa8c16', actionPanel: 'hunter_confirm', brightness: 0.6 }
  },
  hunter_sleep: {
    next: 'calculate_death', env: 'night', roleRequired: 'hunter', duration: 4, auto_proceed: true,
    getAudio: () => ['HUNTER_SLEEP'],
    ui: { title: '猎人', tips: '请闭眼', actionPanel: 'hunter_confirm', brightness: 0.1 }
  },
  calculate_death: {
    next: 'day_announce', env: 'day', duration: 0, auto_proceed: true,
    ui: { title: '正在结算...', tips: '请稍候', actionPanel: 'none' }
  },
  day_announce: {
    next: null, env: 'day', duration: 5, auto_proceed: true,
    getAudio: () => ['DAWN'],
    ui: { title: '天亮了', tips: '等待结算...', color: '#ffd700', actionPanel: 'none' }
  },
  day_dawn: {
    next: 'discussion', env: 'day', duration: 20, auto_proceed: true,
    getAudio: (gs) => AUDIO_KEYS.ANNOUNCE_DEATH((gs.last_night_deaths || []).map(d => d.seat)),
    ui: { title: '揭晓死讯', tips: '正在结算...', color: '#ffd700', actionPanel: 'none' }
  },
  discussion: {
    next: 'voting', env: 'day', duration: 300, auto_proceed: true,
    getAudio: () => ['DISCUSSION_START'],
    ui: { title: '自由讨论', tips: '请按顺序发言', actionBtn: '结束发言', color: '#52c41a', actionPanel: 'none' }
  },
  voting: {
    next: 'exile_announce', env: 'day', duration: 40, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_EXILE'],
    ui: { title: '放逐投票', tips: '请点击头像投票', actionBtn: '弃票', color: '#ff4d4f', actionPanel: 'vote_exile' }
  },
  leave_speech: {
    next: 'night_start', env: 'day', duration: 45, auto_proceed: true,
    getAudio: () => ['LEAVE_SPEECH'],
    ui: { title: '发表遗言', tips: '请被放逐玩家发表遗言', actionBtn: '结束发言', color: '#722ed1', actionPanel: 'none' }
  },
  sheriff_nomination: {
    next: 'sheriff_speech', env: 'day', duration: 20, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['ELECTION_START'],
    ui: { title: '警长竞选', tips: '想要上警的请举手', actionBtn: '下一步', color: '#ffd700', actionPanel: 'sheriff_nomination' }
  },
  sheriff_speech: {
    next: 'sheriff_voting', env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['SPEECH_START'],
    ui: { title: '竞选发言', tips: '竞选者请发言', actionBtn: '结束发言', color: '#ffd700', actionPanel: 'none' }
  },
  sheriff_voting: {
    next: 'election_announce', env: 'day', duration: 35, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_SHERIFF'],
    ui: { title: '警长投票', tips: '请投给候选人', actionBtn: '弃票', color: '#ffd700', actionPanel: 'vote_sheriff' }
  },
  sheriff_pk_speech: {
    next: 'sheriff_pk_voting', env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['PK_START'],
    ui: { title: 'PK发言', tips: '平票玩家请轮流发言', actionBtn: '结束发言', color: '#fa541c', actionPanel: 'none' }
  },
  sheriff_pk_voting: {
    next: 'election_announce', env: 'day', duration: 35, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_SHERIFF'],
    ui: { title: 'PK投票', tips: '请对PK玩家投票', actionBtn: '弃票', color: '#ffd700', actionPanel: 'vote_sheriff' }
  },
  election_announce: {
    next: 'day_dawn', env: 'day', duration: 15, auto_proceed: true,
    getAudio: (gs) => {
      if (gs.election_result === 'tie_pk') return ['TIE_PK'];
      if (gs.election_result === 'tie') return ['TIE_RE_VOTE'];
      if (gs.election_result === 'elected' && gs.sheriff_seat) { return [`PLAYER_${gs.sheriff_seat}`, 'ELECTED']; }
      return ['ELECTED'];
    },
    ui: { title: '竞选结果', tips: '正在公布...', color: '#ffd700', actionPanel: 'none' }
  },
  hunter_action: {
    next: 'discussion', env: 'day', duration: 15, allowAction: ['hunter'], auto_proceed: true,
    getAudio: () => ['HUNTER_ACTION'],
    ui: { title: '猎人行动', tips: '请带走一名玩家', actionBtn: '不开枪', color: '#fa8c16', actionPanel: 'hunter_action' }
  },
  sheriff_handover: {
    next: 'discussion', env: 'day', duration: 10, allowAction: ['sheriff'], auto_proceed: true,
    getAudio: () => ['HANDOVER_BADGE'],
    ui: { title: '移交警徽', tips: '请选择一名玩家移交警徽，或选择撕毁', actionBtn: '撕毁', color: '#ffd700', actionPanel: 'sheriff_handover' }
  },
  day_pk: {
    next: 'pk_voting', env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['PK_START'],
    ui: { title: 'PK发言', tips: '平票玩家请轮流发言', color: '#fa541c', actionPanel: 'none' }
  },
  pk_voting: {
    next: 'exile_announce', env: 'day', duration: 40, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_EXILE'],
    ui: { title: 'PK投票', tips: '请在PK位中选择', actionBtn: '弃票', color: '#ff4d4f', actionPanel: 'pk_voting' }
  },
  exile_announce: {
    next: 'leave_speech', env: 'day', duration: 15, auto_proceed: true,
    getAudio: (gs) => {
      if (gs.exile_result === 'tie') return ['TIE_PK'];
      if (gs.exile_result === 'out' && gs.exile_seat) { return [`PLAYER_${gs.exile_seat}`, 'BE_EXILED']; }
      return ['BE_EXILED'];
    },
    ui: { title: '投票结果', tips: '正在公布...', color: '#ff4d4f', actionPanel: 'none' }
  },
};

module.exports = { AUDIO_KEYS, flowConfig };
