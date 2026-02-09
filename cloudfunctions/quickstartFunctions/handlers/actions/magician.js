const { getMe, requireAliveRole, requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  magicianAction: async (ev) => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'magician', '您不是魔术师', '您已出局');
    if (!guard.ok) return guard.res;
    const targetSeats = (ev.targetSeats || []).map(Number);
    if (targetSeats.length !== 2 || targetSeats[0] === targetSeats[1]) return { success: false, message: '必须选择两名不同玩家' };
    for (const seat of targetSeats) {
      const aliveTarget = requireTargetAlive(ctx, seat);
      if (!aliveTarget.ok) return aliveTarget.res;
    }
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'current_round_actions.magician_exchange': targetSeats } });
    return { success: true };
  }
});
