// miniprogram/pages/recordDetail/recordDetail.js
Page({
  data: {
    recordId: null,
    record: null,
    loading: true,
    showVotingModal: false,
    currentSelectedVotingRound: null
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        recordId: options.id
      });
      this.fetchRecordDetail(options.id);
    } else {
      wx.showToast({
        title: '缺少对局ID',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  fetchRecordDetail(recordId) {
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中' });

    // Option 2: Direct database query (if permissions allow for 'game_records' collection read)
    const db = wx.cloud.database();
    db.collection('game_records').doc(recordId).get().then(recordRes => {
      if (recordRes.data) {
        let record = recordRes.data;
        // 关键修复：兼容旧版嵌套结构
        if (record.data && !record.players) {
          record = { ...record, ...record.data };
        }

        // 1. 创建座位映射以便快速查找
        const seatMap = {};
        if (record.players) {
          record.players.forEach(p => {
            seatMap[p.seat] = p;
          });
        }

        // 2. 增强 voting_history 数据，直接包含头像和昵称
        if (record.voting_history) {
          // 获取警长席位 (通过 timeline 查找最后一次当选或移交后的警长)
          let sheriffSeat = null;
          if (record.timeline) {
            const sheriffEvents = record.timeline.filter(e => e.text.includes('当选') || e.text.includes('移交'));
            if (sheriffEvents.length > 0) {
              const lastEvent = sheriffEvents[sheriffEvents.length - 1];
              const match = lastEvent.text.match(/(\d+)号/);
              if (match) sheriffSeat = Number(match[1]);
            }
          }

          record.voting_history.forEach(round => {
            // Group by target
            const votesByTarget = {}; // targetSeat -> { targetInfo, voters: [] }
            const voteKeys = Object.keys(round.votes || {}).sort((a, b) => Number(a) - Number(b));

            voteKeys.forEach(voterSeat => {
              const targetSeat = round.votes[voterSeat];
              const voter = seatMap[voterSeat] || { seat: voterSeat, nickname: `${voterSeat}号` };
              const isSheriff = Number(voterSeat) === sheriffSeat;

              if (!votesByTarget[targetSeat]) {
                let target = null;
                if (targetSeat > 0) {
                  target = seatMap[targetSeat] || { seat: targetSeat, nickname: `${targetSeat}号` };
                }
                votesByTarget[targetSeat] = {
                  targetSeat: targetSeat,
                  targetAvatar: target ? (target.avatar_url || '../../images/icons/avatar.png') : '',
                  targetName: target ? target.nickname : '弃票',
                  isAbstain: targetSeat == 0,
                  voters: []
                };
              }

              votesByTarget[targetSeat].voters.push({
                seat: voterSeat,
                avatar: voter.avatar_url || '../../images/icons/avatar.png',
                name: voter.nickname,
                isSheriff
              });
            });

            // Convert to array and sort
            round.enrichedVotes = Object.values(votesByTarget).sort((a, b) => {
              if (a.isAbstain) return 1;
              if (b.isAbstain) return -1;
              return b.voters.length - a.voters.length;
            });
          });

          // Match voting history to timeline events
          if (record.timeline) {
            record.voting_history.forEach(round => {
              // Find the last timeline event that matches the day and phase
              // This ensures we attach the vote result to the end of that phase's logs
              const matchingEvents = record.timeline.filter(e => e.day === round.day && e.phase === round.phase);
              if (matchingEvents.length > 0) {
                const lastEvent = matchingEvents[matchingEvents.length - 1];
                lastEvent.relatedVotingRound = round;
              }
            });
          }
        }

        this.setData({
          record: { ...record, record_date: new Date(record.record_date).toLocaleString() },
          loading: false
        });
      } else {
        wx.showToast({ title: '对局记录未找到', icon: 'none' });
        setTimeout(() => { wx.navigateBack(); }, 1500);
      }
      wx.hideLoading();
    }).catch(e => {
      console.error('获取对局详情失败', e);
      wx.showToast({ title: '加载对局详情失败', icon: 'none' });
      setTimeout(() => { wx.navigateBack(); }, 1500);
      wx.hideLoading();
    });
  },

  openVotingModal(e) {
    const round = e.currentTarget.dataset.round;
    this.setData({
      currentSelectedVotingRound: round,
      showVotingModal: true
    });
  },

  closeVotingModal() {
    this.setData({
      showVotingModal: false,
      currentSelectedVotingRound: null
    });
  }
});
