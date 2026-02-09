const { getMe, requireAliveRole } = require('./guards');

module.exports = (ctx) => ({
  gravekeeperAction: async () => {
    const me = getMe(ctx);
    const guard = requireAliveRole(me, 'gravekeeper', '您不是守墓人', '您已出局');
    if (!guard.ok) return guard.res;

    const exiledSeat = ctx.roomDoc.game_state.last_exiled_seat;
    if (!exiledSeat) return { success: true, result: [] };
    const p = ctx.roomDoc.players.find(pl => pl.seat === exiledSeat);
    const role = p ? p.role : 'unknown';
    const camp = (role && ctx.WOLF_ROLES.includes(role)) || p?.role_state?.is_wolf_side ? 'wolf' : 'good';
    const result = [{ seat: exiledSeat, role, camp }];
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'current_round_actions.gravekeeper_result': result } });
    return { success: true, result };
  }
});
