const { ROLE_PHASES, ROLES, GAME_PHASES } = require('./constants');

const rnd = (arr) => arr && arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;

/**
 * Strategy handlers for different game phases
 */
const strategies = {
    // --- Night Actions ---
    [ROLE_PHASES.WEREWOLF_ACTION]: (ctx) => {
        const wolfBots = ctx.bots.filter(b => ['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf'].includes(b.role));
        if (wolfBots.length === 0) return;

        // 1. Check for existing votes (Human Leader)
        const currentVotes = ctx.roomDoc.current_round_actions.werewolf_votes || {};
        const voteCounts = {};
        let maxVote = 0;
        let humanTarget = null;

        Object.entries(currentVotes).forEach(([openid, seat]) => {
            // Filter out bots' previous votes if running multiple times, but hard to distinguish here.
            // Assume non-bot openid is human.
            if (!openid.startsWith('bot_')) {
                voteCounts[seat] = (voteCounts[seat] || 0) + 1;
                if (voteCounts[seat] > maxVote) {
                    maxVote = voteCounts[seat];
                    humanTarget = seat;
                }
            }
        });

        // 2. Decide Target
        let targetSeat = null;
        if (humanTarget) {
            const tPlayer = ctx.alive.find(p => p.seat == humanTarget);
            // Verify target is valid (not a teammate)
            if (tPlayer && !['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'].includes(tPlayer.role)) {
                targetSeat = humanTarget;
                ctx.log(`狼人机器人跟随人类玩家刀了 ${targetSeat}号`);
            }
        }

        if (!targetSeat) {
            const validTargets = ctx.alive.filter(p => !['werewolf', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle'].includes(p.role));
            const victim = rnd(validTargets);
            if (victim) targetSeat = victim.seat;
        }

        if (targetSeat) {
            wolfBots.forEach(b => {
                ctx.updates[`current_round_actions.werewolf_votes.${b.openid}`] = targetSeat;
            });
            if (!humanTarget) ctx.log(`狼人们集火了 ${targetSeat}号`);
        }
    },

    [ROLE_PHASES.WITCH_ACTION]: (ctx) => {
        const witchBot = ctx.getBot(ROLES.WITCH);
        if (!witchBot) return;

        const wIdx = ctx.getPlayerIndex(witchBot.seat);
        const witchState = witchBot.role_state || {};

        console.log(`[BOT_WITCH] Seat: ${witchBot.seat}, SaveUsed: ${witchState.witch_save_used}, PoisonUsed: ${witchState.witch_poison_used}`);

        // Check werewolf target
        const votes = ctx.roomDoc.current_round_actions.werewolf_votes || {};
        const vCounts = {};
        Object.values(votes).forEach(v => vCounts[v] = (vCounts[v] || 0) + 1);
        const victimSeat = Object.keys(vCounts).length > 0 ? Number(Object.keys(vCounts).sort((a, b) => vCounts[b] - vCounts[a])[0]) : null;

        if (victimSeat && !witchState.witch_save_used && Math.random() < 0.8) {
            if (victimSeat !== witchBot.seat) {
                console.log(`[BOT_WITCH] DECISION: Save ${victimSeat}`);
                ctx.updates['current_round_actions.witch_action.save'] = true;
                ctx.updates[`players.${wIdx}.role_state.witch_save_used`] = true;
                ctx.log(`女巫使用了救药给 ${victimSeat}号`);
            } else {
                console.log(`[BOT_WITCH] DECISION: Skip (Self-Save Forbidden)`);
            }
        } else if (!witchState.witch_poison_used && Math.random() < 0.2) {
            const pTarget = rnd(ctx.alive.filter(p => p.seat !== witchBot.seat));
            if (pTarget) {
                console.log(`[BOT_WITCH] DECISION: Poison ${pTarget.seat}`);
                ctx.updates['current_round_actions.witch_action.poison_target'] = pTarget.seat;
                ctx.updates[`players.${wIdx}.role_state.witch_poison_used`] = true;
                ctx.log(`女巫使用了毒药给 ${pTarget.seat}号`);
            }
        } else {
            console.log(`[BOT_WITCH] DECISION: Skip (Random or No Target)`);
        }
    },

    [ROLE_PHASES.SEER_ACTION]: (ctx) => {
        const seer = ctx.getBot(ROLES.SEER);
        if (seer) {
            const target = rnd(ctx.alive.filter(x => x.role !== ROLES.SEER));
            if (target) {
                const isBad = ['werewolf', 'wolf_beauty', 'gargoyle', 'wolf_king'].includes(target.role);
                ctx.updates['current_round_actions.seer_check'] = { target: target.seat, isBad };
                ctx.log(`预言家查验了 ${target.seat}号`);
            }
        }
    },

    [ROLE_PHASES.GUARD_ACTION]: (ctx) => {
        const guard = ctx.getBot(ROLES.GUARD);
        if (guard) {
            const target = rnd(ctx.alive.filter(p => p.seat !== guard.role_state.guard_last_protected_seat));
            if (target) {
                ctx.updates['current_round_actions.guard_protect'] = target.seat;
                const gIdx = ctx.getPlayerIndex(guard.seat);
                ctx.updates[`players.${gIdx}.role_state.guard_last_protected_seat`] = target.seat;
                ctx.log(`守卫守护了 ${target.seat}号`);
            }
        }
    },

    [ROLE_PHASES.CUPID_ACTION]: (ctx) => {
        const cupid = ctx.getBot(ROLES.CUPID);
        if (cupid) {
            const t = ctx.alive.map(p => p.seat).sort(() => Math.random() - 0.5).slice(0, 2);
            if (t.length === 2) {
                ctx.updates['game_state.lovers'] = t;
                ctx.log(`丘比特连接了 ${t[0]} & ${t[1]}`);
            }
        }
    },

    [ROLE_PHASES.MAGICIAN_ACTION]: (ctx) => {
        const mag = ctx.getBot(ROLES.MAGICIAN);
        if (mag) {
            const t = ctx.alive.map(p => p.seat).sort(() => Math.random() - 0.5).slice(0, 2);
            if (t.length === 2) {
                ctx.updates['current_round_actions.magician_exchange'] = t;
                ctx.log(`魔术师交换了 ${t[0]} & ${t[1]}`);
            }
        }
    },

    [ROLE_PHASES.DREAM_CATCHER_ACTION]: (ctx) => {
        const dc = ctx.getBot(ROLES.DREAM_CATCHER);
        if (dc) {
            const target = rnd(ctx.alive.filter(p => p.seat !== dc.seat));
            if (target) {
                ctx.updates['current_round_actions.dream_catcher_sleep'] = target.seat;
                ctx.log(`摄梦人摄梦了 ${target.seat}号`);
            }
        }
    },

    [ROLE_PHASES.WOLF_BEAUTY_ACTION]: (ctx) => {
        const wb = ctx.getBot(ROLES.WOLF_BEAUTY);
        if (wb) {
            const target = rnd(ctx.alive.filter(p => p.role !== ROLES.WEREWOLF));
            if (target) {
                ctx.updates['current_round_actions.wolf_beauty_charm'] = target.seat;
                ctx.log(`狼美人魅惑了 ${target.seat}号`);
            }
        }
    },

    [ROLE_PHASES.GARGOYLE_ACTION]: (ctx) => {
        const gar = ctx.getBot(ROLES.GARGOYLE);
        if (gar) {
            const target = rnd(ctx.alive.filter(p => p.role !== ROLES.WEREWOLF));
            if (target) {
                ctx.updates['current_round_actions.gargoyle_check'] = target.seat;
                ctx.log(`石像鬼查验了 ${target.seat}号`);
            }
        }
    },

    [ROLE_PHASES.MERCHANT_ACTION]: (ctx) => {
        const mer = ctx.getBot(ROLES.MERCHANT);
        if (mer) {
            const target = rnd(ctx.alive.filter(p => p.role !== ROLES.WEREWOLF && p.role !== ROLES.MERCHANT));
            if (target) {
                const items = ['poison', 'check', 'shield'];
                const item = rnd(items);
                ctx.updates['current_round_actions.merchant_trade'] = target.seat;
                ctx.updates['current_round_actions.merchant_item'] = item;
                ctx.log(`黑商给 ${target.seat}号 交易了 ${item}`);
            }
        }
    },

    [ROLE_PHASES.SILENCER_ACTION]: (ctx) => {
        const sil = ctx.getBot(ROLES.SILENCER);
        if (sil) {
            const target = rnd(ctx.alive.filter(p => p.seat !== sil.seat));
            if (target) {
                ctx.updates['current_round_actions.silencer_silence'] = target.seat;
                ctx.log(`禁言长老禁言了 ${target.seat}号`);
            }
        }
    },

    [ROLE_PHASES.WILD_CHILD_ACTION]: (ctx) => {
        const wc = ctx.getBot(ROLES.WILD_CHILD);
        if (wc) {
            const target = rnd(ctx.alive.filter(p => p.seat !== wc.seat));
            if (target) {
                const wcIdx = ctx.getPlayerIndex(wc.seat);
                ctx.updates[`players.${wcIdx}.role_state.model_seat`] = target.seat;
                ctx.log(`野孩子选择了 ${target.seat}号 作为榜样`);
            }
        }
    },

    [ROLE_PHASES.HUNTER_ACTION]: (ctx) => {
        const hunterBot = ctx.getBot(ROLES.HUNTER);
        if (hunterBot && !hunterBot.role_state.hunter_shoot_used) {
            const target = rnd(ctx.alive.filter(p => p.seat !== hunterBot.seat));
            if (target) {
                ctx.updates['current_round_actions.hunter_shoot'] = target.seat;
                const hIdx = ctx.getPlayerIndex(hunterBot.seat);
                ctx.updates[`players.${hIdx}.role_state.hunter_shoot_used`] = true;
                ctx.log(`猎人开枪指向 ${target.seat}号`);
            }
        }
    },

    // --- Sheriff Actions ---
    [ROLE_PHASES.SHERIFF_NOMINATION]: (ctx) => {
        const cands = ctx.game_state.sheriff_candidate_seats || [];
        const newCands = [...cands];
        ctx.bots.forEach(b => {
            if (!newCands.includes(b.seat) && Math.random() > 0.5) {
                newCands.push(b.seat);
                ctx.log(`${b.seat}号 机器人参选警长`);
            }
        });
        if (newCands.length === 0 && ctx.bots.length > 0) newCands.push(ctx.bots[0].seat);
        ctx.updates['game_state.sheriff_candidate_seats'] = newCands;
    },

    [ROLE_PHASES.SHERIFF_VOTING]: (ctx) => {
        const cands = ctx.game_state.sheriff_candidate_seats || [];
        ctx.bots.forEach(b => {
            if (!b.is_alive || b.death_reason) return;
            if (!cands.includes(b.seat)) {
                if (ctx.roomDoc.current_round_actions?.silencer_silence === b.seat) return;
                const t = rnd(cands);
                if (t) ctx.updates[`current_round_actions.sheriff_votes.${b.seat}`] = t;
            }
        });
    },

    [ROLE_PHASES.SHERIFF_HANDOVER]: (ctx) => {
        const sheriffSeat = ctx.game_state.sheriff_seat;
        const sheriffPlayer = ctx.roomDoc.players.find(p => p.seat === sheriffSeat);
        if (sheriffPlayer && sheriffPlayer.openid.startsWith('bot_')) {
            const handoverTarget = rnd(ctx.alive.filter(p => p.seat !== sheriffSeat));
            if (handoverTarget) {
                ctx.updates['game_state.sheriff_seat'] = handoverTarget.seat;
                ctx.log(`机器人将警徽移交给了 ${handoverTarget.seat}号`);
            } else {
                ctx.updates['game_state.sheriff_seat'] = 0; // Destroy
                ctx.log('机器人撕毁了警徽');
            }
        }
    },

    // --- Day Actions ---
    [ROLE_PHASES.DAY_VOTING]: (ctx) => {
        ctx.bots.forEach(b => {
            if (!b.is_alive) return;
            if (ctx.roomDoc.current_round_actions?.silencer_silence === b.seat) return;
            // Target must be alive and NOT themselves
            const target = rnd(ctx.alive.filter(x => x.seat !== b.seat));
            if (target) {
                ctx.updates[`current_round_actions.day_votes.${b.seat}`] = target.seat;
            }
        });
    }
};

class BotContext {
    constructor(db, roomDoc, updates, hiddenTimeline) {
        this.db = db;
        this.roomDoc = roomDoc;
        this.updates = updates;
        this.hiddenTimeline = hiddenTimeline;

        this.game_state = roomDoc.game_state;

        // Caches
        this.players = roomDoc.players;
        const pendingDeaths = new Set((this.game_state.last_night_deaths || []).map(d => d.seat));
        this.alive = this.players.filter(p => p.is_alive && !p.death_reason && !pendingDeaths.has(p.seat));
        this.bots = this.alive.filter(p => p.openid.startsWith('bot_'));
    }

    getBot(role) {
        return this.bots.find(b => b.role === role);
    }

    getBots(role) {
        return this.bots.filter(b => b.role === role);
    }

    getPlayerIndex(seat) {
        return this.players.findIndex(p => p.seat === seat);
    }

    log(text) {
        this.hiddenTimeline.push({
            day: this.game_state.day_count,
            phase: this.game_state.phase,
            text: `[机器人] ${text}`,
            timestamp: new Date(),
            type: 'god_log'
        });
    }
}

const simulateBotActions = async (db, roomDoc, roomDocId) => {
    let up = {};
    const ht = roomDoc.hidden_timeline || [];
    const gs = roomDoc.game_state;

    const context = new BotContext(db, roomDoc, up, ht);

    // Dispatch logic
    let handlerKey = null;

    if (strategies[gs.sub_phase]) {
        handlerKey = gs.sub_phase;
    } else if (gs.sub_phase === ROLE_PHASES.SHERIFF_NOMINATION) {
        handlerKey = ROLE_PHASES.SHERIFF_NOMINATION;
    } else if (gs.sub_phase === GAME_PHASES.SHERIFF_VOTING || gs.sub_phase === GAME_PHASES.SHERIFF_PK_VOTING) {
        handlerKey = ROLE_PHASES.SHERIFF_VOTING;
    } else if (gs.phase === ROLE_PHASES.DAY_VOTING || gs.sub_phase === GAME_PHASES.VOTING || gs.sub_phase === GAME_PHASES.PK_VOTING) {
        handlerKey = ROLE_PHASES.DAY_VOTING;
    }

    if (handlerKey && strategies[handlerKey]) {
        console.log(`[BOT] Executing strategy: ${handlerKey}`);
        strategies[handlerKey](context);
    }

    // Commit updates
    up.hidden_timeline = ht;
    // Remove if empty? Original code didn't check empty hidden_ineline logic specifically but guarded update
    if (Object.keys(up).length > 0) {
        await db.collection('game_rooms').doc(roomDocId).update({ data: up });
    }
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
        role: ROLES.UNKNOWN,
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
