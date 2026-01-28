// miniprogram/constants/audioScripts.js

const AUDIO_SCRIPTS = {
  // --- 全局 ---
  GAME_START: {
    text: "天黑请闭眼。",
    duration: 3000
  },

  // --- 丘比特阶段 ---
  CUPID: {
    start: "丘比特请睁眼。",
    action: "请连情侣。",
    end: "丘比特请闭眼。"
  },

  LOVERS: {
    start: "情侣请睁眼。",
    end: "情侣请闭眼。"
  },

  // --- 守卫阶段 ---
  GUARD: {
    start: "守卫请睁眼。",
    action: "请守护。",
    end: "守卫请闭眼。"
  },

  // --- 狼人阶段 ---
  WEREWOLF: {
    start: "狼人请睁眼。",
    action: "请杀人。",
    end: "狼人请闭眼。"
  },

  // --- 预言家阶段 ---
  SEER: {
    start: "预言家请睁眼。",
    action: "请验人。",
    end: "预言家请闭眼。"
  },

  // --- 女巫阶段 ---
  WITCH: {
    start: "女巫请睁眼。",
    action_save: "他死了，救吗？",
    action_poison: "要毒吗？",
    end: "女巫请闭眼。"
  },

  // --- 猎人阶段 ---
  HUNTER: {
    start: "猎人请睁眼。",
    end: "猎人请闭眼。"
  },

  // --- Additional Roles ---
  WILD_CHILD: { start: "野孩子请睁眼。", action: "请选择榜样。", end: "野孩子请闭眼。" },
  MAGICIAN: { start: "魔术师请睁眼。", action: "请交换号码。", end: "魔术师请闭眼。" },
  DREAM_CATCHER: { start: "摄梦人请睁眼。", action: "请选择。", end: "摄梦人请闭眼。" },
  WOLF_BEAUTY: { start: "狼美人请睁眼。", action: "请魅惑。", end: "狼美人请闭眼。" },
  GARGOYLE: { start: "石像鬼请睁眼。", action: "请查验。", end: "石像鬼请闭眼。" },
  MERCHANT: { start: "黑商请睁眼。", action: "请交易。", end: "黑商请闭眼。" },
  SILENCER: { start: "禁言长老请睁眼。", action: "请禁言。", end: "禁言长老请闭眼。" },
  GRAVEKEEPER: { start: "守墓人请睁眼。", action: "请确认。", end: "守墓人请闭眼。" },
  BEAR: { start: "熊请睁眼。", action: "......", end: "熊请闭眼。" },
  KNIGHT: { text: "骑士请决斗" },

  // --- 白天/竞选 ---
  DAY_START: {
    text: "天亮了，请大家睁眼。",
    duration: 3000
  },

  GAME_OVER: { text: "游戏结束" },
  WOLF_WIN_VILLAGER: { text: "狼人屠杀所有村民，狼人阵营胜利！" },
  WOLF_WIN_GOD: { text: "狼人屠杀所有神职，狼人阵营胜利！" },
  VILLAGER_WIN: { text: "狼人全部出局，好人阵营胜利！" },
  THIRD_PARTY_WIN: { text: "游戏结束，第三方阵营胜利！" },

  ELECTION_START: {
    text: "天亮了，竞选警长请举手。",
    duration: 3000
  },

  // --- 死亡通报 ---
  ANNOUNCE_DEATH: (deadSeats) => {
    if (deadSeats.length === 0) {
      return "昨晚，是平安夜。";
    }
    const seatStr = deadSeats.join('号, ') + '号';
    return `昨晚，${seatStr} 玩家倒在了血泊中。`;
  }
};

module.exports = { AUDIO_SCRIPTS };
