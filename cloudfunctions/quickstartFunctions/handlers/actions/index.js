const buildWerewolf = require('./werewolf');
const buildWitch = require('./witch');
const buildSeer = require('./seer');
const buildGuard = require('./guard');
const buildVoting = require('./voting');
const buildWolfExplode = require('./wolfExplode');
const buildHunter = require('./hunter');
const buildCupid = require('./cupid');
const buildMagician = require('./magician');
const buildDreamCatcher = require('./dreamCatcher');
const buildWolfBeauty = require('./wolfBeauty');
const buildGargoyle = require('./gargoyle');
const buildMerchant = require('./merchant');
const buildSilencer = require('./silencer');
const buildWildChild = require('./wildChild');
const buildGravekeeper = require('./gravekeeper');

module.exports = (ctx) => ({
  nextPhase: async (ev) => {
    const isCreatorOrJudge = ctx.roomDoc._openid === ctx.wxCtx.OPENID;
    if (!isCreatorOrJudge) {
      return { success: false, message: '无权限: 仅房主(兼法官)可流转游戏阶段' };
    }
    return ctx.nextPhase(ctx.eventRoomId, ctx.roomDoc, ctx.roomDocId);
  },
  pingAutoProceed: async () => {
    // Client heartbeat only; no phase transition here.
    return { success: true };
  },
  confirmRoleAction: async (ev) => {
    const roleMap = {
      'guard_phase': 'guard',
      'magician_phase': 'magician',
      'dream_catcher_phase': 'dream_catcher',
      'wolf_beauty_phase': 'wolf_beauty',
      'gargoyle_phase': 'gargoyle',
      'merchant_phase': 'merchant',
      'silencer_phase': 'silencer',
      'wild_child_phase': 'wild_child',
      'gravekeeper_phase': 'gravekeeper',
      'cupid_phase': 'cupid',
      'hunter_phase': 'hunter',
      'lover_phase': 'lover',
      'witch_phase': 'witch',
      'seer_phase': 'seer'
    };
    const subPhase = ctx.roomDoc.game_state.sub_phase;
    const roleKey = roleMap[subPhase];
    if (!roleKey) return { success: false, message: '当前阶段不支持手动确认' };

    const me = (ctx.roomDoc.players || []).find(p => p.openid === ctx.wxCtx.OPENID);
    const isCreatorOrJudge = ctx.roomDoc._openid === ctx.wxCtx.OPENID;
    if (!me && !isCreatorOrJudge) return { success: false, message: '未入座无法确认' };

    let canConfirm = false;
    if (isCreatorOrJudge) {
      canConfirm = true;
    } else if (roleKey === 'lover') {
      const lovers = ctx.roomDoc.game_state.lovers || [];
      canConfirm = lovers.includes(me.seat);
    } else {
      canConfirm = !!me && me.is_alive && me.role === roleKey;
    }

    if (!canConfirm) {
      return { success: false, message: '无权限确认该阶段' };
    }

    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { [`current_round_actions.${roleKey}_acted`]: true }
    });
    return await ctx.nextPhase(ctx.eventRoomId, ctx.roomDoc, ctx.roomDocId);
  },
  ...buildWerewolf(ctx),
  ...buildWitch(ctx),
  ...buildSeer(ctx),
  ...buildGuard(ctx),
  ...buildVoting(ctx),
  ...buildWolfExplode(ctx),
  ...buildHunter(ctx),
  ...buildCupid(ctx),
  ...buildMagician(ctx),
  ...buildDreamCatcher(ctx),
  ...buildWolfBeauty(ctx),
  ...buildGargoyle(ctx),
  ...buildMerchant(ctx),
  ...buildSilencer(ctx),
  ...buildWildChild(ctx),
  ...buildGravekeeper(ctx)
});
