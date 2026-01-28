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
  WILD_CHILD_WAKE: 'wild_child_wake',
  WILD_CHILD_ACTION: 'wild_child_action',
  WILD_CHILD_SLEEP: 'wild_child_sleep',
  CUPID_WAKE: 'cupid_wake',
  CUPID_ACTION: 'cupid_action',
  CUPID_SLEEP: 'cupid_sleep',
  LOVER_WAKE: 'lover_wake',
  LOVER_CONFIRM: 'lover_confirm',
  LOVER_SLEEP: 'lover_sleep',
  GUARD_WAKE: 'guard_wake',
  GUARD_ACTION: 'guard_action',
  GUARD_SLEEP: 'guard_sleep',
  MAGICIAN_WAKE: 'magician_wake',
  MAGICIAN_ACTION: 'magician_action',
  MAGICIAN_SLEEP: 'magician_sleep',
  DREAM_CATCHER_WAKE: 'dream_catcher_wake',
  DREAM_CATCHER_ACTION: 'dream_catcher_action',
  DREAM_CATCHER_SLEEP: 'dream_catcher_sleep',
  WEREWOLF_WAKE: 'werewolf_wake',
  WEREWOLF_ACTION: 'werewolf_action',
  WEREWOLF_SLEEP: 'werewolf_sleep',
  WOLF_BEAUTY_WAKE: 'wolf_beauty_wake',
  WOLF_BEAUTY_ACTION: 'wolf_beauty_action',
  WOLF_BEAUTY_SLEEP: 'wolf_beauty_sleep',
  GARGOYLE_WAKE: 'gargoyle_wake',
  GARGOYLE_ACTION: 'gargoyle_action',
  GARGOYLE_SLEEP: 'gargoyle_sleep',
  WITCH_WAKE: 'witch_wake',
  WITCH_ACTION: 'witch_action',
  WITCH_SLEEP: 'witch_sleep',
  MERCHANT_WAKE: 'merchant_wake',
  MERCHANT_ACTION: 'merchant_action',
  MERCHANT_SLEEP: 'merchant_sleep',
  SILENCER_WAKE: 'silencer_wake',
  SILENCER_ACTION: 'silencer_action',
  SILENCER_SLEEP: 'silencer_sleep',
  SEER_WAKE: 'seer_wake',
  SEER_ACTION: 'seer_action',
  SEER_SLEEP: 'seer_sleep',
  GRAVEKEEPER_WAKE: 'gravekeeper_wake',
  GRAVEKEEPER_ACTION: 'gravekeeper_action',
  GRAVEKEEPER_SLEEP: 'gravekeeper_sleep',
  HUNTER_WAKE: 'hunter_wake',
  HUNTER_CONFIRM: 'hunter_confirm',
  HUNTER_SLEEP: 'hunter_sleep',
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
    next: GAME_PHASES.DEAL_CARDS, env: 'day', duration: 4, auto_proceed: true,
    getAudio: () => ['WELCOME'],
    ui: { title: '🎉 欢迎参与', tips: '游戏即将开始', color: '#ffec3d', actionPanel: 'none', brightness: 0.7 }
  },
  [GAME_PHASES.DEAL_CARDS]: {
    next: GAME_PHASES.NIGHT_START, env: 'day', duration: 10, auto_proceed: true,
    getAudio: () => ['DEAL_CARDS'],
    ui: { title: '🎴 发放身份', tips: '请确认您的身份牌', color: '#ffa940', actionPanel: 'none', brightness: 0.7 }
  },
  [GAME_PHASES.NIGHT_START]: {
    next: GAME_PHASES.WILD_CHILD_WAKE, env: 'night', duration: 8, auto_proceed: true,
    getAudio: (gs) => gs.day_count === 1 ? ['GAME_START_FULL'] : ['DARK_FULL'],
    ui: { title: '🌙 入夜准备', tips: '天黑请闭眼', color: '#8c8c8c', actionPanel: 'none', brightness: 0.7 }
  },
  [GAME_PHASES.WILD_CHILD_WAKE]: {
    next: GAME_PHASES.WILD_CHILD_ACTION, env: 'night', roleRequired: 'wild_child', firstNightOnly: true, duration: 4, auto_proceed: true,
    getAudio: () => ['WILD_CHILD_WAKE'],
    ui: { title: '野孩子', tips: '请睁眼', actionPanel: 'wild_child', brightness: 0.1 }
  },
  [GAME_PHASES.WILD_CHILD_ACTION]: {
    next: GAME_PHASES.WILD_CHILD_SLEEP, env: 'night', roleRequired: 'wild_child', firstNightOnly: true, duration: 20, allowAction: ['wild_child'], auto_proceed: true,
    getAudio: () => ['WILD_CHILD_OPERATE'],
    ui: { title: '野孩子行动', tips: '请选择榜样', actionBtn: '确认', color: '#722ed1', actionPanel: 'wild_child', brightness: 0.6 }
  },
  [GAME_PHASES.WILD_CHILD_SLEEP]: {
    next: GAME_PHASES.CUPID_WAKE, env: 'night', roleRequired: 'wild_child', duration: 4, auto_proceed: true,
    getAudio: () => ['WILD_CHILD_SLEEP'],
    ui: { title: '野孩子', tips: '请闭眼', actionPanel: 'wild_child', brightness: 0.1 }
  },
  [GAME_PHASES.CUPID_WAKE]: {
    next: GAME_PHASES.CUPID_ACTION, env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 4, auto_proceed: true,
    getAudio: () => ['CUPID_WAKE'],
    ui: { title: '丘比特', tips: '请睁眼', actionPanel: 'cupid', brightness: 0.1 }
  },
  [GAME_PHASES.CUPID_ACTION]: {
    next: GAME_PHASES.CUPID_SLEEP, env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 25, allowAction: ['cupid'], auto_proceed: true,
    getAudio: () => ['CUPID_OPERATE'],
    ui: { title: '丘比特行动', tips: '请连接情侣', actionBtn: '确认连接', color: '#ff85c0', actionPanel: 'cupid', brightness: 0.6 }
  },
  [GAME_PHASES.CUPID_SLEEP]: {
    next: GAME_PHASES.LOVER_WAKE, env: 'night', roleRequired: 'cupid', duration: 4, auto_proceed: true,
    getAudio: () => ['CUPID_SLEEP'],
    ui: { title: '丘比特', tips: '请闭眼', actionPanel: 'cupid', brightness: 0.1 }
  },
  [GAME_PHASES.LOVER_WAKE]: {
    next: GAME_PHASES.LOVER_CONFIRM, env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 5, auto_proceed: true,
    getAudio: () => ['LOVER_WAKE'],
    ui: { title: '情侣', tips: '请睁眼', actionPanel: 'lover_confirm', brightness: 0.1 }
  },
  [GAME_PHASES.LOVER_CONFIRM]: {
    next: GAME_PHASES.LOVER_SLEEP, env: 'night', roleRequired: 'cupid', firstNightOnly: true, duration: 10, auto_proceed: true,
    ui: { title: '情侣确认', tips: '确认你的另一半', color: '#ff4d4f', actionPanel: 'lover_confirm', brightness: 0.6 }
  },
  [GAME_PHASES.LOVER_SLEEP]: {
    next: GAME_PHASES.GUARD_WAKE, env: 'night', roleRequired: 'cupid', duration: 4, auto_proceed: true,
    getAudio: () => ['LOVER_END'],
    ui: { title: '情侣', tips: '请闭眼', actionPanel: 'lover_confirm', brightness: 0.1 }
  },
  [GAME_PHASES.GUARD_WAKE]: {
    next: GAME_PHASES.GUARD_ACTION, env: 'night', roleRequired: 'guard', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['GUARD_WAKE'],
    ui: { title: '守卫', tips: '请睁眼', actionPanel: 'guard', brightness: 0.1 }
  },
  [GAME_PHASES.GUARD_ACTION]: {
    next: GAME_PHASES.GUARD_SLEEP, env: 'night', roleRequired: 'guard', checkAlive: true, duration: 20, allowAction: ['guard'], auto_proceed: true,
    getAudio: () => ['GUARD_OPERATE'],
    ui: { title: '守卫行动', tips: '请选择目标', color: '#52c41a', actionPanel: 'guard', brightness: 0.6 }
  },
  [GAME_PHASES.GUARD_SLEEP]: {
    next: GAME_PHASES.MAGICIAN_WAKE, env: 'night', roleRequired: 'guard', duration: 4, auto_proceed: true,
    getAudio: () => ['GUARD_SLEEP'],
    ui: { title: '守卫', tips: '请闭眼', actionPanel: 'guard', brightness: 0.1 }
  },
  [GAME_PHASES.MAGICIAN_WAKE]: {
    next: GAME_PHASES.MAGICIAN_ACTION, env: 'night', roleRequired: 'magician', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['MAGICIAN_WAKE'],
    ui: { title: '魔术师', tips: '请睁眼', actionPanel: 'magician', brightness: 0.1 }
  },
  [GAME_PHASES.MAGICIAN_ACTION]: {
    next: GAME_PHASES.MAGICIAN_SLEEP, env: 'night', roleRequired: 'magician', checkAlive: true, duration: 20, allowAction: ['magician'], auto_proceed: true,
    getAudio: () => ['MAGICIAN_OPERATE'],
    ui: { title: '魔术师行动', tips: '请交换号码', color: '#13c2c2', actionPanel: 'magician', brightness: 0.6 }
  },
  [GAME_PHASES.MAGICIAN_SLEEP]: {
    next: GAME_PHASES.DREAM_CATCHER_WAKE, env: 'night', roleRequired: 'magician', duration: 4, auto_proceed: true,
    getAudio: () => ['MAGICIAN_SLEEP'],
    ui: { title: '魔术师', tips: '请闭眼', actionPanel: 'magician', brightness: 0.1 }
  },
  [GAME_PHASES.DREAM_CATCHER_WAKE]: {
    next: GAME_PHASES.DREAM_CATCHER_ACTION, env: 'night', roleRequired: 'dream_catcher', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['DREAM_CATCHER_WAKE'],
    ui: { title: '摄梦人', tips: '请睁眼', actionPanel: 'dream_catcher', brightness: 0.1 }
  },
  [GAME_PHASES.DREAM_CATCHER_ACTION]: {
    next: GAME_PHASES.DREAM_CATCHER_SLEEP, env: 'night', roleRequired: 'dream_catcher', checkAlive: true, duration: 20, allowAction: ['dream_catcher'], auto_proceed: true,
    getAudio: () => ['DREAM_CATCHER_OPERATE'],
    ui: { title: '摄梦人行动', tips: '请选择', color: '#eb2f96', actionPanel: 'dream_catcher', brightness: 0.6 }
  },
  [GAME_PHASES.DREAM_CATCHER_SLEEP]: {
    next: GAME_PHASES.WEREWOLF_WAKE, env: 'night', roleRequired: 'dream_catcher', duration: 4, auto_proceed: true,
    getAudio: () => ['DREAM_CATCHER_SLEEP'],
    ui: { title: '摄梦人', tips: '请闭眼', actionPanel: 'dream_catcher', brightness: 0.1 }
  },
  [GAME_PHASES.WEREWOLF_WAKE]: {
    next: GAME_PHASES.WEREWOLF_ACTION, env: 'night', roleRequired: 'werewolf', duration: 4, auto_proceed: true,
    getAudio: () => ['WEREWOLF_WAKE'],
    ui: { title: '狼人', tips: '请睁眼', actionPanel: 'werewolf', brightness: 0.1 }
  },
  [GAME_PHASES.WEREWOLF_ACTION]: {
    next: GAME_PHASES.WEREWOLF_SLEEP, env: 'night', roleRequired: 'werewolf', duration: 30, allowAction: ['werewolf'], auto_proceed: true,
    getAudio: () => ['WEREWOLF_OPERATE'],
    ui: { title: '狼人行动', tips: '请选择目标', color: '#ff4d4f', actionPanel: 'werewolf', brightness: 0.6 }
  },
  [GAME_PHASES.WEREWOLF_SLEEP]: {
    next: GAME_PHASES.WOLF_BEAUTY_WAKE, env: 'night', roleRequired: 'werewolf', duration: 4, auto_proceed: true,
    getAudio: () => ['WEREWOLF_SLEEP'],
    ui: { title: '狼人', tips: '请闭眼', actionPanel: 'werewolf', brightness: 0.1 }
  },
  [GAME_PHASES.WOLF_BEAUTY_WAKE]: {
    next: GAME_PHASES.WOLF_BEAUTY_ACTION, env: 'night', roleRequired: 'wolf_beauty', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['WOLF_BEAUTY_WAKE'],
    ui: { title: '狼美人', tips: '请睁眼', actionPanel: 'wolf_beauty', brightness: 0.1 }
  },
  [GAME_PHASES.WOLF_BEAUTY_ACTION]: {
    next: GAME_PHASES.WOLF_BEAUTY_SLEEP, env: 'night', roleRequired: 'wolf_beauty', checkAlive: true, duration: 20, allowAction: ['wolf_beauty'], auto_proceed: true,
    getAudio: () => ['WOLF_BEAUTY_OPERATE'],
    ui: { title: '狼美人行动', tips: '请魅惑', color: '#f5222d', actionPanel: 'wolf_beauty', brightness: 0.6 }
  },
  [GAME_PHASES.WOLF_BEAUTY_SLEEP]: {
    next: GAME_PHASES.GARGOYLE_WAKE, env: 'night', roleRequired: 'wolf_beauty', duration: 4, auto_proceed: true,
    getAudio: () => ['WOLF_BEAUTY_SLEEP'],
    ui: { title: '狼美人', tips: '请闭眼', actionPanel: 'wolf_beauty', brightness: 0.1 }
  },
  [GAME_PHASES.GARGOYLE_WAKE]: {
    next: GAME_PHASES.GARGOYLE_ACTION, env: 'night', roleRequired: 'gargoyle', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['GARGOYLE_WAKE'],
    ui: { title: '石像鬼', tips: '请睁眼', actionPanel: 'gargoyle', brightness: 0.1 }
  },
  [GAME_PHASES.GARGOYLE_ACTION]: {
    next: GAME_PHASES.GARGOYLE_SLEEP, env: 'night', roleRequired: 'gargoyle', checkAlive: true, duration: 20, allowAction: ['gargoyle'], auto_proceed: true,
    getAudio: () => ['GARGOYLE_OPERATE'],
    ui: { title: '石像鬼行动', tips: '请查验', color: '#595959', actionPanel: 'gargoyle', brightness: 0.6 }
  },
  [GAME_PHASES.GARGOYLE_SLEEP]: {
    next: GAME_PHASES.WITCH_WAKE, env: 'night', roleRequired: 'gargoyle', duration: 4, auto_proceed: true,
    getAudio: () => ['GARGOYLE_SLEEP'],
    ui: { title: '石像鬼', tips: '请闭眼', actionPanel: 'gargoyle', brightness: 0.1 }
  },
  [GAME_PHASES.WITCH_WAKE]: {
    next: GAME_PHASES.WITCH_ACTION, env: 'night', roleRequired: 'witch', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['WITCH_WAKE'],
    ui: { title: '女巫', tips: '请睁眼', actionPanel: 'witch', brightness: 0.1 }
  },
  [GAME_PHASES.WITCH_ACTION]: {
    next: GAME_PHASES.WITCH_SLEEP, env: 'night', roleRequired: 'witch', checkAlive: true, duration: 25, allowAction: ['witch'], auto_proceed: true,
    getAudio: () => ['WITCH_OPERATE'],
    ui: { title: '女巫行动', tips: '请用药', color: '#722ed1', actionBtn: '跳过', actionPanel: 'witch', brightness: 0.6 }
  },
  [GAME_PHASES.WITCH_SLEEP]: {
    next: GAME_PHASES.MERCHANT_WAKE, env: 'night', roleRequired: 'witch', duration: 4, auto_proceed: true,
    getAudio: () => ['WITCH_SLEEP'],
    ui: { title: '女巫', tips: '请闭眼', actionPanel: 'witch', brightness: 0.1 }
  },
  [GAME_PHASES.MERCHANT_WAKE]: {
    next: GAME_PHASES.MERCHANT_ACTION, env: 'night', roleRequired: 'merchant', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['MERCHANT_WAKE'],
    ui: { title: '黑商', tips: '请睁眼', actionPanel: 'merchant', brightness: 0.1 }
  },
  [GAME_PHASES.MERCHANT_ACTION]: {
    next: GAME_PHASES.MERCHANT_SLEEP, env: 'night', roleRequired: 'merchant', checkAlive: true, duration: 25, allowAction: ['merchant'], auto_proceed: true,
    getAudio: () => ['MERCHANT_OPERATE'],
    ui: { title: '黑商行动', tips: '请交易', color: '#faad14', actionPanel: 'merchant', brightness: 0.6 }
  },
  [GAME_PHASES.MERCHANT_SLEEP]: {
    next: GAME_PHASES.SILENCER_WAKE, env: 'night', roleRequired: 'merchant', duration: 4, auto_proceed: true,
    getAudio: () => ['MERCHANT_SLEEP'],
    ui: { title: '黑商', tips: '请闭眼', actionPanel: 'merchant', brightness: 0.1 }
  },
  [GAME_PHASES.SILENCER_WAKE]: {
    next: GAME_PHASES.SILENCER_ACTION, env: 'night', roleRequired: 'silencer', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['SILENCER_WAKE'],
    ui: { title: '禁言长老', tips: '请睁眼', actionPanel: 'silencer', brightness: 0.1 }
  },
  [GAME_PHASES.SILENCER_ACTION]: {
    next: GAME_PHASES.SILENCER_SLEEP, env: 'night', roleRequired: 'silencer', checkAlive: true, duration: 20, allowAction: ['silencer'], auto_proceed: true,
    getAudio: () => ['SILENCER_OPERATE'],
    ui: { title: '禁言长老行动', tips: '请禁言', color: '#2f54eb', actionPanel: 'silencer', brightness: 0.6 }
  },
  [GAME_PHASES.SILENCER_SLEEP]: {
    next: GAME_PHASES.SEER_WAKE, env: 'night', roleRequired: 'silencer', duration: 4, auto_proceed: true,
    getAudio: () => ['SILENCER_SLEEP'],
    ui: { title: '禁言长老', tips: '请闭眼', actionPanel: 'silencer', brightness: 0.1 }
  },
  [GAME_PHASES.SEER_WAKE]: {
    next: GAME_PHASES.SEER_ACTION, env: 'night', roleRequired: 'seer', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['SEER_WAKE'],
    ui: { title: '预言家', tips: '请睁眼', actionPanel: 'seer', brightness: 0.1 }
  },
  [GAME_PHASES.SEER_ACTION]: {
    next: GAME_PHASES.SEER_SLEEP, env: 'night', roleRequired: 'seer', checkAlive: true, duration: 20, allowAction: ['seer'], auto_proceed: true,
    getAudio: () => ['SEER_OPERATE'],
    ui: { title: '预言家行动', tips: '请查验', color: '#1890ff', actionPanel: 'seer', brightness: 0.6 }
  },
  [GAME_PHASES.SEER_SLEEP]: {
    next: GAME_PHASES.GRAVEKEEPER_WAKE, env: 'night', roleRequired: 'seer', duration: 4, auto_proceed: true,
    getAudio: () => ['SEER_SLEEP'],
    ui: { title: '预言家', tips: '请闭眼', actionPanel: 'seer', brightness: 0.1 }
  },
  [GAME_PHASES.GRAVEKEEPER_WAKE]: {
    next: GAME_PHASES.GRAVEKEEPER_ACTION, env: 'night', roleRequired: 'gravekeeper', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['GRAVEKEEPER_WAKE'],
    ui: { title: '守墓人', tips: '请睁眼', actionPanel: 'gravekeeper', brightness: 0.1 }
  },
  [GAME_PHASES.GRAVEKEEPER_ACTION]: {
    next: GAME_PHASES.GRAVEKEEPER_SLEEP, env: 'night', roleRequired: 'gravekeeper', checkAlive: true, duration: 20, allowAction: ['gravekeeper'], auto_proceed: true,
    getAudio: () => ['GRAVEKEEPER_OPERATE'],
    ui: { title: '守墓人行动', tips: '请确认', color: '#5b8c00', actionPanel: 'gravekeeper', brightness: 0.6 }
  },
  [GAME_PHASES.GRAVEKEEPER_SLEEP]: {
    next: GAME_PHASES.HUNTER_WAKE, env: 'night', roleRequired: 'gravekeeper', duration: 4, auto_proceed: true,
    getAudio: () => ['GRAVEKEEPER_SLEEP'],
    ui: { title: '守墓人', tips: '请闭眼', actionPanel: 'gravekeeper', brightness: 0.1 }
  },
  [GAME_PHASES.HUNTER_WAKE]: {
    next: GAME_PHASES.HUNTER_CONFIRM, env: 'night', roleRequired: 'hunter', checkAlive: true, duration: 4, auto_proceed: true,
    getAudio: () => ['HUNTER_WAKE'],
    ui: { title: '猎人', tips: '请睁眼', actionPanel: 'hunter_confirm', brightness: 0.1 }
  },
  [GAME_PHASES.HUNTER_CONFIRM]: {
    next: GAME_PHASES.HUNTER_SLEEP, env: 'night', roleRequired: 'hunter', checkAlive: true, duration: 12, allowAction: ['hunter'], auto_proceed: true,
    getAudio: () => ['HUNTER_OPERATE'],
    ui: { title: '猎人确认', tips: '请确认状态', color: '#fa8c16', actionPanel: 'hunter_confirm', brightness: 0.6 }
  },
  [GAME_PHASES.HUNTER_SLEEP]: {
    next: GAME_PHASES.DAY_ANNOUNCE, env: 'night', roleRequired: 'hunter', duration: 4, auto_proceed: true,
    getAudio: () => ['HUNTER_SLEEP'],
    ui: { title: '猎人', tips: '请闭眼', actionPanel: 'hunter_confirm', brightness: 0.1 }
  },
  [GAME_PHASES.CALCULATE_DEATH]: {
    next: null, env: 'day', duration: 3, auto_proceed: true,
    ui: { title: '正在结算...', tips: '请稍候', actionPanel: 'none' }
  },
  [GAME_PHASES.DAY_ANNOUNCE]: {
    next: GAME_PHASES.CALCULATE_DEATH, env: 'day', duration: 8, auto_proceed: true,
    getAudio: () => ['DAWN'],
    ui: { title: '天亮了', tips: '等待结算...', color: '#ffd700', actionPanel: 'none' }
  },
  [GAME_PHASES.DAY_DAWN]: {
    next: GAME_PHASES.DISCUSSION, env: 'day', duration: 20, auto_proceed: true,
    getAudio: (gs) => AUDIO_KEYS.ANNOUNCE_DEATH((gs.last_night_deaths || []).map(d => d.seat)),
    ui: { title: '揭晓死讯', tips: '正在结算...', color: '#ffd700', actionPanel: 'none' }
  },
  [GAME_PHASES.DISCUSSION]: {
    next: GAME_PHASES.VOTING, env: 'day', duration: 300, auto_proceed: true,
    getAudio: () => ['DISCUSSION_START'],
    ui: { title: '自由讨论', tips: '请按顺序发言', actionBtn: '结束发言', color: '#52c41a', actionPanel: 'none' }
  },
  [GAME_PHASES.VOTING]: {
    next: GAME_PHASES.EXILE_ANNOUNCE, env: 'day', duration: 40, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_EXILE'],
    ui: { title: '放逐投票', tips: '请点击头像投票', actionBtn: '弃票', color: '#ff4d4f', actionPanel: 'vote_exile' }
  },
  [GAME_PHASES.LEAVE_SPEECH]: {
    next: GAME_PHASES.NIGHT_START, env: 'day', duration: 45, auto_proceed: true,
    getAudio: () => ['LEAVE_SPEECH'],
    ui: { title: '发表遗言', tips: '请被放逐玩家发表遗言', actionBtn: '结束发言', color: '#722ed1', actionPanel: 'none' }
  },
  [GAME_PHASES.SHERIFF_NOMINATION]: {
    next: GAME_PHASES.SHERIFF_SPEECH, env: 'day', duration: 20, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['ELECTION_START'],
    ui: { title: '警长竞选', tips: '想要上警的请举手', actionBtn: '下一步', color: '#ffd700', actionPanel: 'sheriff_nomination' }
  },
  [GAME_PHASES.SHERIFF_SPEECH]: {
    next: GAME_PHASES.SHERIFF_VOTING, env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['SPEECH_START'],
    ui: { title: '竞选发言', tips: '竞选者请发言', actionBtn: '结束发言', color: '#ffd700', actionPanel: 'none' }
  },
  [GAME_PHASES.SHERIFF_VOTING]: {
    next: GAME_PHASES.ELECTION_ANNOUNCE, env: 'day', duration: 35, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_SHERIFF'],
    ui: { title: '警长投票', tips: '请投给候选人', actionBtn: '弃票', color: '#ffd700', actionPanel: 'vote_sheriff' }
  },
  [GAME_PHASES.SHERIFF_PK_SPEECH]: {
    next: GAME_PHASES.SHERIFF_PK_VOTING, env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['PK_START'],
    ui: { title: 'PK发言', tips: '平票玩家请轮流发言', actionBtn: '结束发言', color: '#fa541c', actionPanel: 'none' }
  },
  [GAME_PHASES.SHERIFF_PK_VOTING]: {
    next: GAME_PHASES.ELECTION_ANNOUNCE, env: 'day', duration: 35, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_SHERIFF'],
    ui: { title: 'PK投票', tips: '请对PK玩家投票', actionBtn: '弃票', color: '#ffd700', actionPanel: 'vote_sheriff' }
  },
  [GAME_PHASES.ELECTION_ANNOUNCE]: {
    next: GAME_PHASES.DAY_DAWN, env: 'day', duration: 15, auto_proceed: true,
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
    next: GAME_PHASES.DISCUSSION, env: 'day', duration: 10, allowAction: ['sheriff'], auto_proceed: true,
    getAudio: () => ['HANDOVER_BADGE'],
    ui: { title: '移交警徽', tips: '请选择一名玩家移交警徽，或选择撕毁', actionBtn: '撕毁', color: '#ffd700', actionPanel: 'sheriff_handover' }
  },
  [GAME_PHASES.DAY_PK]: {
    next: GAME_PHASES.PK_VOTING, env: 'day', duration: 120, auto_proceed: true,
    getAudio: () => ['PK_START'],
    ui: { title: 'PK发言', tips: '平票玩家请轮流发言', color: '#fa541c', actionPanel: 'none' }
  },
  [GAME_PHASES.PK_VOTING]: {
    next: GAME_PHASES.EXILE_ANNOUNCE, env: 'day', duration: 40, allowAction: ['all'], auto_proceed: true,
    getAudio: () => ['VOTE_START_EXILE'],
    ui: { title: 'PK投票', tips: '请在PK位中选择', actionBtn: '弃票', color: '#ff4d4f', actionPanel: 'pk_voting' }
  },
  [GAME_PHASES.EXILE_ANNOUNCE]: {
    next: GAME_PHASES.LEAVE_SPEECH, env: 'day', duration: 15, auto_proceed: true,
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

const ROLES = {
  WEREWOLF: 'werewolf',
  WITCH: 'witch',
  SEER: 'seer',
  GUARD: 'guard',
  CUPID: 'cupid',
  MAGICIAN: 'magician',
  DREAM_CATCHER: 'dream_catcher',
  WOLF_BEAUTY: 'wolf_beauty',
  GARGOYLE: 'gargoyle',
  MERCHANT: 'merchant',
  SILENCER: 'silencer',
  WILD_CHILD: 'wild_child',
  HUNTER: 'hunter',
  IDIOT: 'idiot',
  VILLAGER: 'villager',
  UNKNOWN: 'unknown'
};

module.exports = { AUDIO_KEYS, flowConfig, GAME_PHASES, ROLE_PHASES, ROLES };
