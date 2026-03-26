/**
 * 角色系统配置
 * 用于定义角色的基础属性、所属阵营等
 */

const ROLE_FACTIONS = {
    WOLF: 'wolf',
    GOD: 'god',
    VILLAGER: 'villager',
    THIRD_PARTY: 'third_party'
};

const ROLES_CONFIG = {
    werewolf: { faction: ROLE_FACTIONS.WOLF, name: '狼人' },
    wolf_king: { faction: ROLE_FACTIONS.WOLF, name: '狼王' },
    wolf_beauty: { faction: ROLE_FACTIONS.WOLF, name: '狼美人' },
    hidden_wolf: { faction: ROLE_FACTIONS.WOLF, name: '隐狼' },
    gargoyle: { faction: ROLE_FACTIONS.WOLF, name: '石像鬼' },

    seer: { faction: ROLE_FACTIONS.GOD, name: '预言家' },
    witch: { faction: ROLE_FACTIONS.GOD, name: '女巫' },
    hunter: { faction: ROLE_FACTIONS.GOD, name: '猎人' },
    idiot: { faction: ROLE_FACTIONS.GOD, name: '白痴' },
    guard: { faction: ROLE_FACTIONS.GOD, name: '守卫' },
    cupid: { faction: ROLE_FACTIONS.GOD, name: '丘比特' },
    merchant: { faction: ROLE_FACTIONS.GOD, name: '黑商' },
    silencer: { faction: ROLE_FACTIONS.GOD, name: '禁言长老' },
    gravekeeper: { faction: ROLE_FACTIONS.GOD, name: '守墓人' },
    magician: { faction: ROLE_FACTIONS.GOD, name: '魔术师' },
    dream_catcher: { faction: ROLE_FACTIONS.GOD, name: '摄梦人' },

    wild_child: { faction: ROLE_FACTIONS.VILLAGER, name: '野孩子' },
    villager: { faction: ROLE_FACTIONS.VILLAGER, name: '平民' }
};

const getRolesByFaction = (faction) => {
    return Object.keys(ROLES_CONFIG).filter(role => ROLES_CONFIG[role].faction === faction);
};

module.exports = {
    ROLE_FACTIONS,
    ROLES_CONFIG,
    getRolesByFaction
};
