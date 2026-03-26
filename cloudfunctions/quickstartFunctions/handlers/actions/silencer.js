const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  silencerAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'silencer', '您不是禁言长老', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    if (ctx.roomDoc.game_state.sub_phase !== 'silencer_phase') {
      return { success: false, message: '当前不是禁言长老行动阶段' };
    }
    
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ 
      data: { 
        'current_round_actions.silencer_silence': targetSeat,
        'current_round_actions.silencer_acted': true
      } 
    });
    const refreshed = await ctx.db.collection('game_rooms').doc(ctx.roomDocId).get();
    await ctx.nextPhase(ctx.eventRoomId, refreshed.data, ctx.roomDocId);
    return { success: true };
  }
});
