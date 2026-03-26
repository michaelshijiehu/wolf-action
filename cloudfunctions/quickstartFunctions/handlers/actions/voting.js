const { requireTargetAlive } = require('./guards');

module.exports = (ctx) => ({
  roleConfirm: async () => {
    const me = ctx.roomDoc.players.find(p => p.openid === ctx.wxCtx.OPENID);
    if (!me) return { success: false, message: '未入座无法确认身份' };
    if (ctx.roomDoc.game_state.sub_phase !== 'deal_cards') {
      return { success: false, message: '当前不是发牌阶段' };
    }
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({
      data: { [`current_round_actions.role_confirmations.${ctx.wxCtx.OPENID}`]: true }
    });
    return { success: true };
  },

  voteAction: async (ev) => {
    const me = ctx.roomDoc.players.find(p => p.openid === ctx.wxCtx.OPENID);
    if (!me || !me.is_alive || me.death_reason) {
      return { success: false, message: '您已出局，无法投票' };
    }
    if (ctx.roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法投票' };
    if (me.role === 'idiot' && me.role_state?.idiot_revealed) {
      return { success: false, message: '白痴翻牌后无投票权' };
    }

    // 投票ID校验
    if (ev.voteId && ctx.roomDoc.game_state.current_vote_id !== ev.voteId) {
      return { success: false, message: '投票已失效' };
    }

    const subPhase = ctx.roomDoc.game_state.sub_phase;
    if (subPhase !== 'voting' && subPhase !== 'pk_voting') {
      return { success: false, message: '当前不是投票阶段' };
    }
    if (subPhase === 'pk_voting') {
      const pkCandidates = ctx.roomDoc.game_state.pk_candidates || [];
      if (pkCandidates.includes(me.seat)) {
        return { success: false, message: 'PK玩家不能参与投票' };
      }
    }

    const targetSeat = Number(ev.targetSeat);
    if (targetSeat > 0) {
      if (targetSeat === me.seat) {
        return { success: false, message: '不能投给自己' };
      }
      const aliveTarget = requireTargetAlive(ctx, targetSeat);
      if (!aliveTarget.ok) return aliveTarget.res;

      if (subPhase === 'pk_voting') {
        const pkCandidates = ctx.roomDoc.game_state.pk_candidates || [];
        if (!pkCandidates.includes(targetSeat)) {
          return { success: false, message: '只能投给处于PK状态的玩家' };
        }
      }
    }

    const up = { [`current_round_actions.day_votes.${me.seat}`]: targetSeat };
    await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: up });

    return { success: true };
  },

  sheriffAction: async (ev) => {
    const me = ctx.roomDoc.players.find(p => p.openid === ctx.wxCtx.OPENID);
    if (!me) return { success: false, message: '未入座' };
    const isDeadTonight = (ctx.roomDoc.game_state.last_night_deaths || []).some(d => d.seat === me.seat);
    const currentSubPhase = ctx.roomDoc.game_state.sub_phase;
    const electionPhases = ['sheriff_nomination', 'sheriff_speech', 'sheriff_voting', 'sheriff_pk_speech', 'sheriff_pk_voting', 'election_announce'];
    const isElectionPhase = electionPhases.includes(currentSubPhase);

    if (ev.action === 'join') {
      if (!isElectionPhase) {
        return { success: false, message: '当前不是竞选阶段' };
      }
      // 只允许存活者，或竞选阶段中的当晚出局者临时参与上警/退水
      const canTempParticipate = isDeadTonight;
      if ((!me.is_alive || me.death_reason) && !canTempParticipate) {
        return { success: false, message: '您已出局，无法上警' };
      }
      if (ctx.roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法上警' };
      let c = ctx.roomDoc.game_state.sheriff_candidate_seats || [];
      if (ev.isJoining) { if (!c.includes(me.seat)) c.push(me.seat); } else { c = c.filter(s => s !== me.seat); }
      
      const updates = { 'game_state.sheriff_candidate_seats': c };
      
      // 核心逻辑：如果退水后只剩一人，直接当选 (覆盖报名、发言、投票全阶段)
      const isElectionOngoing = ['sheriff_nomination', 'sheriff_speech', 'sheriff_voting'].includes(currentSubPhase);
      if (!ev.isJoining && c.length === 1 && isElectionOngoing) {
        updates['game_state.sheriff_seat'] = c[0];
        updates['game_state.election_result'] = 'elected';
        
        await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: updates });
        const updatedRoom = ctx.applyUpdates(ctx.roomDoc, updates);
        return await ctx.nextPhase(ctx.eventRoomId, updatedRoom, ctx.roomDocId);
      }

      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: updates });
    }
    else if (ev.action === 'vote') {
      // 核心拦截：出局或当晚死亡的人不能投票给别人
      if (!me.is_alive || me.death_reason || isDeadTonight) {
        return { success: false, message: '您已出局，无法投票' };
      }
      if (ctx.roomDoc.current_round_actions?.silencer_silence === me.seat) return { success: false, message: '您已被禁言，无法投票' };
      if (me.role === 'idiot' && me.role_state?.idiot_revealed) {
        return { success: false, message: '白痴翻牌后无投票权' };
      }

      // 投票ID校验
      if (ev.voteId && ctx.roomDoc.game_state.current_vote_id !== ev.voteId) {
        return { success: false, message: '投票已失效' };
      }

      const gs = ctx.roomDoc.game_state;
      const subPhase = gs.sub_phase;
      
      // 验证当前是否处于允许竞选投票的阶段
      if (subPhase !== 'sheriff_voting' && subPhase !== 'sheriff_pk_voting') {
        return { success: false, message: '当前不是警长投票阶段' };
      }
      if (subPhase === 'sheriff_voting' && (gs.sheriff_candidate_seats || []).includes(me.seat)) {
        return { success: false, message: '参选人无法投票' };
      }
      if (subPhase === 'sheriff_pk_voting' && (gs.pk_candidates || []).includes(me.seat)) {
        return { success: false, message: 'PK玩家无法投票' };
      }

      const targetSeat = Number(ev.targetSeat);
      if (targetSeat > 0) {
        if (targetSeat === me.seat) {
          return { success: false, message: '不能投给自己' };
        }
        const aliveTarget = requireTargetAlive(ctx, targetSeat);
        if (!aliveTarget.ok) return aliveTarget.res;
        
        // Ensure target is actually a candidate
        if (subPhase === 'sheriff_voting' && !(gs.sheriff_candidate_seats || []).includes(targetSeat)) {
          return { success: false, message: '目标不是警长候选人' };
        }
        if (subPhase === 'sheriff_pk_voting' && !(gs.pk_candidates || []).includes(targetSeat)) {
          return { success: false, message: '目标不是PK候选人' };
        }
      }

      const up = { [`current_round_actions.sheriff_votes.${me.seat}`]: targetSeat };
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: up });
    }
    else if (ev.action === 'handover') {
      if (ctx.roomDoc.game_state.sub_phase !== 'sheriff_handover') {
        return { success: false, message: '当前不是警徽移交阶段' };
      }
      // 允许出局警长移交警徽
      if (ctx.roomDoc.game_state.sheriff_seat !== me.seat) {
        return { success: false, message: '您不是警长，无法操作' };
      }
      
      const targetSeat = Number(ev.targetSeat);
      if (targetSeat > 0) {
        const aliveTarget = requireTargetAlive(ctx, targetSeat);
        if (!aliveTarget.ok) return aliveTarget.res;
      }
      
      const updates = { 'game_state.sheriff_seat': targetSeat };
      
      await ctx.db.collection('game_rooms').doc(ctx.roomDocId).update({ data: updates });
      
      // 立即进入下一阶段
      const updatedRoom = ctx.applyUpdates(ctx.roomDoc, updates);
      return await ctx.nextPhase(ctx.eventRoomId, updatedRoom, ctx.roomDocId);
    }
    return { success: true };
  }
});
