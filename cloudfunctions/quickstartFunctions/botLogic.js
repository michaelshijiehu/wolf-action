const simulateBotActions = async (db, roomDoc, roomDocId) => {
    // FIX: Ensure players with a death reason are treated as dead, even if is_alive is desynced
    const alive = roomDoc.players.filter(p => p.is_alive && !p.death_reason);
    const bots = alive.filter(p => p.openid.startsWith('bot_'));
    const rnd = (arr) => arr && arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
    let up = {};
    const gs = roomDoc.game_state;
    const ht = roomDoc.hidden_timeline || [];

    const addGodLog = (txt) => {
        ht.push({ day: gs.day_count, phase: gs.phase, text: `[机器人] ${txt}`, timestamp: new Date(), type: 'god_log' });
    };

    if (gs.phase === 'night') {
        const sub = gs.sub_phase;

        if (sub === 'werewolf_action') {
            const wolfBots = bots.filter(b => b.role === 'werewolf');
            if (wolfBots.length > 0) {
                // Extra safeguard: Filter from ALL players, ensuring strict alive check
                const validTargets = roomDoc.players.filter(p => p.is_alive && !p.death_reason && p.role !== 'werewolf');
                const victim = rnd(validTargets);
                if (victim) {
                    wolfBots.forEach(b => {
                        up[`current_round_actions.werewolf_votes.${b.openid}`] = victim.seat;
                    });
                    addGodLog(`狼人们集火了 ${victim.seat}号`);
                }
            }
        }
        else if (sub === 'witch_action') {
            const witchBot = bots.find(b => b.role === 'witch');
            if (witchBot) {
                const wIdx = roomDoc.players.findIndex(p => p.seat === witchBot.seat);
                const witchState = witchBot.role_state || {};

                console.log(`[BOT_WITCH] Seat: ${witchBot.seat}, SaveUsed: ${witchState.witch_save_used}, PoisonUsed: ${witchState.witch_poison_used}`);

                // check狼人目标
                const votes = roomDoc.current_round_actions.werewolf_votes || {};
                const vCounts = {}; Object.values(votes).forEach(v => vCounts[v] = (vCounts[v] || 0) + 1);
                const victimSeat = Object.keys(vCounts).length > 0 ? Number(Object.keys(vCounts).sort((a, b) => vCounts[b] - vCounts[a])[0]) : null;

                if (victimSeat && !witchState.witch_save_used && Math.random() < 0.8) {
                    if (victimSeat !== witchBot.seat) {
                        console.log(`[BOT_WITCH] DECISION: Save ${victimSeat}`);
                        up['current_round_actions.witch_action.save'] = true;
                        up[`players.${wIdx}.role_state.witch_save_used`] = true;
                        addGodLog(`女巫使用了救药给 ${victimSeat}号`);
                    } else {
                        console.log(`[BOT_WITCH] DECISION: Skip (Self-Save Forbidden)`);
                    }
                } else if (!witchState.witch_poison_used && Math.random() < 0.2) {
                    const pTarget = rnd(alive.filter(p => p.seat !== witchBot.seat));
                    if (pTarget) {
                        console.log(`[BOT_WITCH] DECISION: Poison ${pTarget.seat}`);
                        up['current_round_actions.witch_action.poison_target'] = pTarget.seat;
                        up[`players.${wIdx}.role_state.witch_poison_used`] = true;
                        addGodLog(`女巫使用了毒药给 ${pTarget.seat}号`);
                    }
                } else {
                    console.log(`[BOT_WITCH] DECISION: Skip (Random or No Target)`);
                }
            }
        }
        else if (sub === 'seer_action') {
            const seer = bots.find(b => b.role === 'seer');
            if (seer) {
                const target = rnd(alive.filter(x => x.role !== 'seer'));
                if (target) {
                    up['current_round_actions.seer_check'] = { target: target.seat };
                    addGodLog(`预言家查验了 ${target.seat}号`);
                }
            }
        }
        else if (sub === 'guard_action') {
            const guard = bots.find(b => b.role === 'guard');
            if (guard) {
                const target = rnd(alive.filter(p => p.seat !== guard.role_state.guard_last_protected_seat));
                if (target) {
                    up['current_round_actions.guard_protect'] = target.seat;
                    const gIdx = roomDoc.players.findIndex(p => p.seat === guard.seat);
                    up[`players.${gIdx}.role_state.guard_last_protected_seat`] = target.seat;
                    addGodLog(`守卫守护了 ${target.seat}号`);
                }
            }
        }
        else if (sub === 'cupid_action') {
            const cupid = bots.find(b => b.role === 'cupid');
            if (cupid) {
                const t = alive.map(p => p.seat).sort(() => Math.random() - 0.5).slice(0, 2);
                if (t.length === 2) {
                    up['game_state.lovers'] = t;
                    addGodLog(`丘比特连接了 ${t[0]} & ${t[1]}`);
                }
            }
        }
        else if (sub === 'magician_action') {
            const mag = bots.find(b => b.role === 'magician');
            if (mag) {
                const t = alive.map(p => p.seat).sort(() => Math.random() - 0.5).slice(0, 2);
                if (t.length === 2) {
                    up['current_round_actions.magician_exchange'] = t;
                    addGodLog(`魔术师交换了 ${t[0]} & ${t[1]}`);
                }
            }
        }
        else if (sub === 'dream_catcher_action') {
            const dc = bots.find(b => b.role === 'dream_catcher');
            if (dc) {
                const target = rnd(alive.filter(p => p.seat !== dc.seat));
                if (target) {
                    up['current_round_actions.dream_catcher_sleep'] = target.seat;
                    addGodLog(`摄梦人摄梦了 ${target.seat}号`);
                }
            }
        }
        else if (sub === 'wolf_beauty_action') {
            const wb = bots.find(b => b.role === 'wolf_beauty');
            if (wb) {
                const target = rnd(alive.filter(p => p.role !== 'werewolf'));
                if (target) {
                    up['current_round_actions.wolf_beauty_charm'] = target.seat;
                    addGodLog(`狼美人魅惑了 ${target.seat}号`);
                }
            }
        }
        else if (sub === 'gargoyle_action') {
            const gar = bots.find(b => b.role === 'gargoyle');
            if (gar) {
                const target = rnd(alive.filter(p => p.role !== 'werewolf'));
                if (target) {
                    up['current_round_actions.gargoyle_check'] = target.seat;
                    addGodLog(`石像鬼查验了 ${target.seat}号`);
                }
            }
        }
        else if (sub === 'merchant_action') {
            const mer = bots.find(b => b.role === 'merchant');
            if (mer) {
                const target = rnd(alive.filter(p => p.role !== 'werewolf' && p.role !== 'merchant'));
                if (target) {
                    const items = ['poison', 'check', 'shield'];
                    const item = rnd(items);
                    up['current_round_actions.merchant_trade'] = target.seat;
                    up['current_round_actions.merchant_item'] = item;
                    addGodLog(`黑商给 ${target.seat}号 交易了 ${item}`);
                }
            }
        }
        else if (sub === 'silencer_action') {
            const sil = bots.find(b => b.role === 'silencer');
            if (sil) {
                const target = rnd(alive.filter(p => p.seat !== sil.seat));
                if (target) {
                    up['current_round_actions.silencer_silence'] = target.seat;
                    addGodLog(`禁言长老禁言了 ${target.seat}号`);
                }
            }
        }
        else if (sub === 'wild_child_action') {
            const wc = bots.find(b => b.role === 'wild_child');
            if (wc) {
                const target = rnd(alive.filter(p => p.seat !== wc.seat));
                if (target) {
                    const wcIdx = roomDoc.players.findIndex(p => p.seat === wc.seat);
                    up[`players.${wcIdx}.role_state.model_seat`] = target.seat;
                    addGodLog(`野孩子选择了 ${target.seat}号 作为榜样`);
                }
            }
        }
    }
    else if (gs.sub_phase === 'sheriff_nomination') {
        const cands = gs.sheriff_candidate_seats || [];
        const newCands = [...cands];
        bots.forEach(b => {
            if (!newCands.includes(b.seat) && Math.random() > 0.5) {
                newCands.push(b.seat);
                addGodLog(`${b.seat}号 机器人参选警长`);
            }
        });
        if (newCands.length === 0 && bots.length > 0) newCands.push(bots[0].seat);
        up['game_state.sheriff_candidate_seats'] = newCands;
    }
    else if (gs.sub_phase === 'sheriff_voting' || gs.sub_phase === 'sheriff_pk_voting') {
        const cands = gs.sheriff_candidate_seats || [];
        bots.forEach(b => {
            if (!cands.includes(b.seat)) {
                const t = rnd(cands);
                if (t) up[`current_round_actions.sheriff_votes.${b.seat}`] = t;
            }
        });
    }
    else if (gs.phase === 'day_voting' || gs.sub_phase === 'voting' || gs.sub_phase === 'pk_voting') {
        bots.forEach(b => {
            // Double check: Only alive bots vote
            if (!b.is_alive) return;

            // Target must be alive and NOT themselves
            const target = rnd(alive.filter(x => x.seat !== b.seat));
            if (target) {
                up[`current_round_actions.day_votes.${b.seat}`] = target.seat;
            }
        });
    }
    else if (gs.sub_phase === 'hunter_action') {
        const hunterBot = bots.find(b => b.role === 'hunter');
        if (hunterBot && !hunterBot.role_state.hunter_shoot_used) {
            const target = rnd(alive.filter(p => p.seat !== hunterBot.seat));
            if (target) {
                up['current_round_actions.hunter_shoot'] = target.seat;
                const hIdx = roomDoc.players.findIndex(p => p.seat === hunterBot.seat);
                up[`players.${hIdx}.role_state.hunter_shoot_used`] = true;
                addGodLog(`猎人开枪指向 ${target.seat}号`);
            }
        }
    }
    else if (gs.sub_phase === 'sheriff_handover') {
        // If current sheriff is a bot, pick a random alive player to handover
        const sheriffSeat = gs.sheriff_seat;
        const sheriffPlayer = roomDoc.players.find(p => p.seat === sheriffSeat);
        if (sheriffPlayer && sheriffPlayer.openid.startsWith('bot_')) {
            const handoverTarget = rnd(alive.filter(p => p.seat !== sheriffSeat));
            if (handoverTarget) {
                up['game_state.sheriff_seat'] = handoverTarget.seat;
                addGodLog(`机器人将警徽移交给了 ${handoverTarget.seat}号`);
            } else {
                up['game_state.sheriff_seat'] = 0; // Destroy
                addGodLog('机器人撕毁了警徽');
            }
        }
    }

    up.hidden_timeline = ht;
    if (Object.keys(up).length > 0) await db.collection('game_rooms').doc(roomDocId).update({ data: up });
    return { success: true };
};

const fillBots = async (db, roomDoc, roomDocId, targetCount) => {
    let p = [...roomDoc.players];
    const target = targetCount || 9;

    const createBot = (s) => ({
        seat: s,
        openid: `bot_${Date.now()}_${s}`,
        nickname: `🤖 Bot ${s}`,
        avatar_url: "",
        is_alive: true,
        role: "unknown",
        role_state: { witch_poison_used: false, witch_save_used: false, hunter_shoot_used: false },
        action_status: { is_ready: true }
    });

    // Fill empty seats
    for (let i = 0; i < p.length; i++) {
        if (!p[i].openid) p[i] = createBot(p[i].seat);
    }

    // Expand if needed
    while (p.length < target) {
        p.push(createBot(p.length + 1));
    }

    await db.collection('game_rooms').doc(roomDocId).update({ data: { players: p, 'config.player_count': p.length } });
    return { success: true };
};

module.exports = {
    simulateBotActions,
    fillBots
};
