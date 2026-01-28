const AUDIO_TEXTS = {
    'DIED_IN_BLOOD': '倒在了血泊中',
    'SAFE_NIGHT': '昨晚，是平安夜',
    'YESTERDAY_NIGHT': '昨晚',
    'GAME_OVER': '游戏结束',
    'WOLF_WIN': '游戏结束，狼人阵营胜利！',
    'VILLAGER_WIN': '游戏结束，好人阵营胜利！',
    'THIRD_PARTY_WIN': '游戏结束，第三方阵营胜利！',
    'EYES_CLOSE': '请闭眼',
    'EYES_OPEN': '请睁眼',
    'DAWN': '天亮了',
    'DARK': '天黑',
    'DAWN_FULL': '天亮了，请大家睁眼。',
    'WELCOME': '欢迎来到狼人杀游戏。',
    'DEAL_CARDS': '正在发牌，请看牌。',
    'DARK_FULL': '天黑请闭眼。',
    'GAME_START_FULL': '天黑请闭眼。',
    'CUPID_WAKE': '丘比特请睁眼。',
    'CUPID_OPERATE': '请连情侣。',
    'CUPID_SLEEP': '丘比特请闭眼。',
    'LOVER_WAKE': '情侣请睁眼。',
    'LOVER_END': '情侣请闭眼。',
    'GUARD_WAKE': '守卫请睁眼。',
    'GUARD_OPERATE': '请守护。',
    'GUARD_SLEEP': '守卫请闭眼。',
    'WEREWOLF_WAKE': '狼人请睁眼。',
    'WEREWOLF_OPERATE': '请杀人。',
    'WEREWOLF_SLEEP': '狼人请闭眼。',
    'WITCH_WAKE': '女巫请睁眼。',
    'WITCH_OPERATE': '请用药。',
    'WITCH_SLEEP': '女巫请闭眼。',
    'SEER_WAKE': '预言家请睁眼。',
    'SEER_OPERATE': '请验人。',
    'SEER_SLEEP': '预言家请闭眼。',
    'HUNTER_WAKE': '猎人请睁眼。',
    'HUNTER_SLEEP': '猎人请闭眼。',
    'ELECTION_START': '天亮了，竞选警长请举手。',
    'ELECTED': '当选警长',
    'PK_START': '平票PK开始，请双方轮流发言',
    'TIE_VOTE': '无人当选或再次平票，直接流局',
    'SPEECH_START': '请竞选玩家按顺序发言',
    'VOTE_START_SHERIFF': '请所有玩家进行投票',
    'VOTE_START_EXILE': '请所有玩家进行放逐投票',
    'HUNTER_ACTION': '请猎人选择开枪目标或跳过',
    'HANDOVER_BADGE': '请移交警徽',
    'LEAVE_SPEECH': '请被放逐玩家发表遗言'
};

// Generate PLAYER_1 to PLAYER_20
for (let i = 1; i <= 20; i++) {
    AUDIO_TEXTS[`PLAYER_${i}`] = `${i}号玩家`;
}

module.exports = AUDIO_TEXTS;
