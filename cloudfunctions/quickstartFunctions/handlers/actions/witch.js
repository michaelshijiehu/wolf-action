module.exports = (ctx) => ({
  witchAction: async (ev) => {
    if (ev.actionType === 'skip') return { success: true };
    const pIdx = ctx.roomDoc.players.findIndex(x => x.role === 'witch');
    if (pIdx === -1) return { success: false, message: '本局无女巫' };
    const player = ctx.roomDoc.players[pIdx];
    if (!player.is_alive) return { success: false, message: '您已出局' };
    const up = {};
    if (ev.actionType === 'save') {
      if (player.role_state.witch_save_used) return { success: false, message: '解药已使用' };
      up['current_round_actions.witch_action.save'] = true;
      up[`players.${pIdx}.role_state.witch_save_used`] = true;
    }
    else if (ev.actionType === 'poison') {
      if (player.role_state.witch_poison_used) return { success: false, message: '毒药已使用' };
      up['current_round_actions.witch_action.poison_target'] = Number(ev.targetSeat);
      up[`players.${pIdx}.role_state.witch_poison_used`] = true;
    }
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: up });
    return { success: true };
  }
});
