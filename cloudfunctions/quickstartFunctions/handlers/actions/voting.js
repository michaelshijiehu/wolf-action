module.exports = (ctx) => ({
  roleConfirm: async () => {
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { [`current_round_actions.role_confirmations.${ctx.wxCtx.OPENID}`]: true }
    });
    return { success: true };
  },

  voteAction: async (ev) => {
    const me = ctx.roomDoc.players.find(p => p.openid === ctx.wxCtx.OPENID);
    if (!me || !me.is_alive) return { success: false, message: '您已出局或未入座' };
    if (me.death_reason) return { success: false, message: '您已出局，无法投票' };
    if (ctx.roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法投票' };

    const up = { [`current_round_actions.day_votes.${me.seat}`]: Number(ev.targetSeat) };
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: up });

    // Check if all voted
    const updatedRoom = ctx.applyUpdates(ctx.roomDoc, up);
    const subPhase = updatedRoom.game_state.sub_phase;
    const votes = updatedRoom.current_round_actions.day_votes || {};

    const pkCands = updatedRoom.game_state.pk_candidates || [];
    const eligibleVoters = updatedRoom.players.filter(p => {
      if (!p.is_alive || p.death_reason) return false;
      if (updatedRoom.current_round_actions.silencer_silence === p.seat) return false;
      if (subPhase === 'pk_voting' && pkCands.includes(p.seat)) return false;
      return true;
    });

    const actualVotesCount = Object.keys(votes).length;
    if (actualVotesCount >= eligibleVoters.length) {
      console.log('[Vote] All eligible players voted. Advancing phase.');
      return await ctx.nextPhase(ctx.eventRoomId, updatedRoom, ctx.roomDocId);
    }

    return { success: true };
  },

  sheriffAction: async (ev) => {
    const me = ctx.roomDoc.players.find(p => p.openid === ctx.wxCtx.OPENID);
    if (!me) return { success: false, message: '未入座' };
    const isDeadTonight = (ctx.roomDoc.game_state.last_night_deaths || []).some(d => d.seat === me.seat);

    if (ev.action === 'join') {
      if (!me.is_alive || isDeadTonight) return { success: false, message: '您已出局或今晚已死亡' };
      if (me.death_reason) return { success: false, message: '您已出局或今晚已死亡' };
      if (ctx.roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法上警' };
      let c = ctx.roomDoc.game_state.sheriff_candidate_seats || [];
      if (ev.isJoining) { if (!c.includes(ev.seat)) c.push(ev.seat); } else { c = c.filter(s => s !== ev.seat); }
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'game_state.sheriff_candidate_seats': c } });
    }
    else if (ev.action === 'vote') {
      if (!me.is_alive || isDeadTonight) return { success: false, message: '您已出局或今晚已死亡，无法投票' };
      if (me.death_reason) return { success: false, message: '您已出局或今晚已死亡，无法投票' };
      if (ctx.roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法投票' };

      const up = { [`current_round_actions.sheriff_votes.${me.seat}`]: Number(ev.targetSeat) };
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: up });

      // Check if all voted
      const updatedRoom = ctx.applyUpdates(ctx.roomDoc, up);
      const subPhase = updatedRoom.game_state.sub_phase;
      const votes = updatedRoom.current_round_actions.sheriff_votes || {};

      const sheriffCands = updatedRoom.game_state.sheriff_candidate_seats || [];
      const pkCands = updatedRoom.game_state.pk_candidates || [];

      const eligibleVoters = updatedRoom.players.filter(p => {
        if (!p.is_alive || p.death_reason) return false;
        // Night deaths are also not eligible for sheriff voting
        if ((updatedRoom.game_state.last_night_deaths || []).some(d => d.seat === p.seat)) return false;
        if (updatedRoom.current_round_actions.silencer_silence === p.seat) return false;

        if (subPhase === 'sheriff_voting' && sheriffCands.includes(p.seat)) return false;
        if (subPhase === 'sheriff_pk_voting' && pkCands.includes(p.seat)) return false;
        return true;
      });

      const actualVotesCount = Object.keys(votes).length;
      if (actualVotesCount >= eligibleVoters.length) {
        console.log('[Sheriff Vote] All eligible players voted. Advancing phase.');
        return await ctx.nextPhase(ctx.eventRoomId, updatedRoom, ctx.roomDocId);
      }
    }
    else if (ev.action === 'handover') {
      if (ctx.roomDoc.game_state.sheriff_seat !== me.seat) return { success: false, message: '您不是警长' };
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: { 'game_state.sheriff_seat': Number(ev.targetSeat) } });
      await ctx.nextPhase(ctx.eventRoomId, ctx.applyUpdates(ctx.roomDoc, { 'game_state.sheriff_seat': Number(ev.targetSeat) }), ctx.roomDocId);
    }
    return { success: true };
  }
});
