module.exports = (ctx) => ({
  debugFillBots: async (ev) => { return await ctx.fillBots(ctx.db, ctx.roomDoc, ctx.roomDocId, ev.targetCount); },
  fillRoom: async (ev) => { return await ctx.fillBots(ctx.db, ctx.roomDoc, ctx.roomDocId, ev.targetCount); },
  runBotCycle: async () => { await ctx.simulateBotActions(ctx.db, ctx.roomDoc, ctx.roomDocId); return { success: true }; }
});
