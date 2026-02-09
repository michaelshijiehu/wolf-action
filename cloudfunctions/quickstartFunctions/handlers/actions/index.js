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
  nextPhase: async () => ctx.nextPhase(ctx.eventRoomId, ctx.roomDoc, ctx.roomDocId),
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
