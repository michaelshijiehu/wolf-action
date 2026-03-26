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
    const isAutoPing = ev.isAutoProceedPing;
    // Allow auto ping (system/cron or authorized client fallback) or authorized manual triggers
    if (!isAutoPing) {
      const isCreatorOrJudge = ctx.roomDoc._openid === ctx.wxCtx.OPENID;
      if (!isCreatorOrJudge) {
        return { success: false, message: '无权限: 仅房主(兼法官)可手动流转游戏阶段' };
      }
    }
    return ctx.nextPhase(ctx.eventRoomId, ctx.roomDoc, ctx.roomDocId);
  },
  pingAutoProceed: async () => {
    // Only used to trigger checkAutoProceedInternal periodically from clients
    return { success: true };
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
