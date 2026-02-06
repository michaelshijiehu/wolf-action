module.exports = Behavior({
    data: {
        showGodViewList: false, 
        isAutoTestMode: false,
        lastAutoSimTime: 0,
        hasBots: false,
        isManualMode: false, 
    },

    methods: {
        toggleGodView() {
            this.setData({ showGodViewList: !this.data.showGodViewList });
        },

        toggleManualMode() {
            this.setData({ isManualMode: !this.data.isManualMode });
            wx.showToast({ title: this.data.isManualMode ? '手动步进模式' : '自动流畅模式', icon: 'none' });
        },

        onAutoTest() {
            if (!this.data.isCreator) return;
            wx.showLoading({ title: '填充机器人...', });
            wx.cloud.callFunction({
                name: 'quickstartFunctions',
                data: {
                    type: 'debugFillBots',
                    roomId: this.data.roomId
                }
            }).then(() => {
                wx.showToast({ title: '机器人已填充', icon: 'success' });
            }).catch(e => {
                console.error(e);
                wx.showToast({ title: '操作失败', icon: 'none' });
            }).finally(() => {
                wx.hideLoading();
            });
        },

        onDevSimulate() {
            if (!this.data.isCreator) return;
            wx.showLoading({ title: '执行一步...', mask: true });
            wx.cloud.callFunction({
                name: 'quickstartFunctions',
                data: {
                    type: 'runBotCycle',
                    roomId: this.data.roomId
                }
            }).then(() => {
                wx.showToast({ title: '执行完成', icon: 'success' });
            }).catch(e => {
                console.error('[Bot] Error:', e);
                wx.showToast({ title: 'Bot Error', icon: 'none' });
            }).finally(() => {
                wx.hideLoading();
            });
        },

        handleDebugRoomUpdate(gameState, lastGameState) {
            if (!this.data.isCreator) return;

            const hasBots = gameState.players.some(p => p.openid.startsWith('bot_'));
            if (hasBots !== this.data.hasBots) this.setData({ hasBots });

            if (!hasBots || gameState.game_state.status !== 'playing') return;
            if (this.data.isManualMode) return;

            const subPhase = gameState.game_state.sub_phase;
            const instructions = gameState.game_state.current_instruction || {};
            const roleReq = instructions.roleRequired;
            const botIsRequired = roleReq && gameState.players.find(p => p.role === roleReq && p.openid.startsWith('bot_') && p.is_alive);
            const isGeneralPhase = ['voting', 'pk_voting', 'sheriff_voting', 'sheriff_nomination', 'hunter_action', 'hunter_confirm', 'lover_confirm', 'game_welcome', 'deal_cards', 'night_start', 'sheriff_handover', 'leave_speech', 'day_announce', 'day_dawn', 'election_announce', 'exile_announce'].includes(subPhase);

            if (botIsRequired || isGeneralPhase) {
                const now = Date.now();
                if (now - this.data.lastAutoSimTime > 2000) {
                    this.setData({ lastAutoSimTime: now });
                    wx.cloud.callFunction({
                        name: 'quickstartFunctions',
                        data: { type: 'runBotCycle', roomId: this.data.roomId }
                    }).catch(err => console.error('[Debug-Driver] Failed:', err));
                }
            }
        }
    }
});