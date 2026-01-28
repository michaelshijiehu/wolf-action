module.exports = Behavior({
    data: {
        showGodViewList: false, // Can be used by Judge or Debug
        isAutoTestMode: false,
        lastAutoSimTime: 0,
        hasBots: false,
        isManualMode: false, // Default to false (Auto), User can toggle to True
    },

    methods: {
        // --- Debug / Test Features ---

        toggleGodView() {
            this.setData({ showGodViewList: !this.data.showGodViewList });
        },

        toggleManualMode() {
            this.setData({ isManualMode: !this.data.isManualMode });
            wx.showToast({ title: this.data.isManualMode ? '手动步进模式' : '自动流畅模式', icon: 'none' });
        },

        // 🤖 Fill Room with Bots (Test Only)
        async onAutoTest() {
            if (!this.data.isCreator) return;
            wx.showLoading({ title: '填充机器人...', });
            try {
                const currentLen = this.data.gameState.players.length;
                const total = this.data.gameState.config.player_count || 12; // Default or config
                // Determine how many to add
                // Actually we usually just "fill rest".
                // Let's reuse the logic if it was inline, or call cloud.
                // The original onAutoTest called a cloud function?
                // Let's implement it here.

                await wx.cloud.callFunction({
                    name: 'quickstartFunctions',
                    data: {
                        type: 'debugFillBots',
                        roomId: this.data.roomId
                    }
                });

                // Default to Manual mode if user explicitly asks? No, stick to current.
                wx.showToast({ title: '机器人已填充', icon: 'success' });
            } catch (e) {
                console.error(e);
                wx.showToast({ title: '操作失败', icon: 'none' });
            } finally {
                wx.hideLoading();
            }
        },

        // 🤖 Manual Trigger Bot Action
        async onDevSimulate() {
            if (!this.data.isCreator) return;
            wx.showLoading({ title: '执行一步...', mask: true });
            try {
                await wx.cloud.callFunction({
                    name: 'quickstartFunctions',
                    data: {
                        type: 'runBotCycle', // The New "Test Driver" Entry Point
                        roomId: this.data.roomId
                    }
                });
                wx.showToast({ title: '执行完成', icon: 'success' });
            } catch (e) {
                console.error('[Bot] Error:', e);
                wx.showToast({ title: 'Bot Error', icon: 'none' });
            } finally {
                wx.hideLoading();
            }
        },

        // 🚀 Auto-Drive Logic (The "Test Driver" Hook)
        // Called from room.js handleRoomUpdate only if isCreator matches
        handleDebugRoomUpdate(gameState, lastGameState) {
            if (!this.data.isCreator) return;

            // Detect Bot Presence
            const hasBots = gameState.players.some(p => p.openid.startsWith('bot_'));
            if (hasBots !== this.data.hasBots) this.setData({ hasBots });

            if (!hasBots || gameState.game_state.status !== 'playing') return;

            // Manual Mode Check: If Manual Mode is ON, DO NOT auto-run.
            if (this.data.isManualMode) return;

            // Check if Auto-Test is Active (Implicitly active if bots exist? Or explicit toggle?)
            // User said "Auto smooth mode".
            // Let's assume if Bots are present, we want them to act.
            // OR we can add a toggle. For now, DEFAULT TO TRUE for bots.

            const subPhase = gameState.game_state.sub_phase;
            const instructions = gameState.game_state.current_instruction || {};

            const roleReq = instructions.roleRequired;
            const botIsRequired = roleReq && gameState.players.find(p => p.role === roleReq && p.openid.startsWith('bot_') && p.is_alive);
            const isGeneralPhase = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_nomination', 'hunter_action', 'hunter_confirm', 'lover_confirm', 'game_welcome', 'deal_cards', 'night_start', 'sheriff_handover', 'leave_speech', 'day_announce', 'day_dawn', 'election_announce', 'exile_announce'].includes(subPhase);

            if (botIsRequired || isGeneralPhase) {
                // Debounce to prevent spamming
                const now = Date.now();
                if (now - this.data.lastAutoSimTime > 2000) {
                    console.log('[Debug-Driver] Triggering Bot Cycle via Cloud...');
                    this.setData({ lastAutoSimTime: now });

                    // Call the Driver
                    wx.cloud.callFunction({
                        name: 'quickstartFunctions',
                        data: { type: 'runBotCycle', roomId: this.data.roomId }
                    }).catch(err => console.error('[Debug-Driver] Failed:', err));
                }
            }
        }
    }
});
