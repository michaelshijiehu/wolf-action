module.exports = Behavior({
  methods: {
    showMarkPlayerModal: function (e) {
        const seat = e.currentTarget.dataset.seat;
        if (this.data.mySeat === seat) { wx.showToast({ title: '不能标记自己', icon: 'none' }); return; }
        const targetPlayer = this.data.gameState.players.find(p => p.seat === seat);
        if (this.data.myRole === 'werewolf' && targetPlayer.role === 'werewolf') { wx.showToast({ title: '队友无需标记', icon: 'none' }); return; }
        this.setData({ showMarkModal: true, currentMarkPlayerSeat: seat, currentMark: this.data.playerMarks[seat] ? this.data.playerMarks[seat].value : null });
      },
      hideMarkPlayerModal: function () { this.setData({ showMarkModal: false, currentMarkPlayerSeat: null, currentMark: null }); },
      selectMarkOption: function (e) { this.setData({ currentMark: e.currentTarget.dataset.mark }); },
      confirmMarkPlayer: function () {
        const seat = this.data.currentMarkPlayerSeat;
        const markValue = this.data.currentMark;
        const selectedOption = this.data.markOptions.find(opt => opt.value === markValue);
        if (seat && selectedOption) {
          const playerMarks = this.data.playerMarks;
          playerMarks[seat] = { value: selectedOption.value, icon: selectedOption.icon, label: selectedOption.label };
          this.setData({ playerMarks: playerMarks });
          this.savePlayerMarks(playerMarks);
          this.hideMarkPlayerModal();
        } else { wx.showToast({ title: '请选择一个标记', icon: 'none' }); }
      },
      clearMarkPlayer: function () {
        const seat = this.data.currentMarkPlayerSeat;
        const playerMarks = this.data.playerMarks;
        delete playerMarks[seat];
        this.setData({ playerMarks: playerMarks });
        this.savePlayerMarks(playerMarks);
        this.hideMarkPlayerModal();
      },
      savePlayerMarks: function (marks) { if (this.data.roomId) wx.setStorageSync(`player_marks_${this.data.roomId}`, marks); },
      loadPlayerMarks: function () {
        if (this.data.roomId) {
          const marks = wx.getStorageSync(`player_marks_${this.data.roomId}`);
          if (marks) this.setData({ playerMarks: marks });
        }
      },
  }
});