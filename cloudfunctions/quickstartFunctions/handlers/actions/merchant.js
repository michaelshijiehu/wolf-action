const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  merchantAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'merchant', '您不是黑商', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeat = Number(ev.targetSeat);
    const item = ev.item; // 'shroud', 'poison', 'lucky_card'
    const aliveTarget = requireTargetAlive(ctx, targetSeat);
    if (!aliveTarget.ok) return aliveTarget.res;
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: {
        'current_round_actions.merchant_trade': targetSeat,
        'current_round_actions.merchant_item': item
      }
    });
    return { success: true };
  }
});
