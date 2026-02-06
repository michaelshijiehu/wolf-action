// index.js
Page({
  data: {
    createLoading: false,
    joinLoading: false,
    showAuthModal: false,
    tempAvatarUrl: '',
    tempNickname: '',
    roomIdInputs: ['', '', '', ''],
    focusIndex: -1, // Initialize to -1 so no input is focused initially
    roomId: '',
    actionType: 'create', // 'create' or 'join'
    showReconnectModal: false,
    reconnectContent: '',
    reconnectRoomId: ''
  },

  onLoad: function (options) {
    // Set initial focus when page loads
    this.setData({ focusIndex: 0 });
  },

  onShow: function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      // 每次回到大厅都检查是否有正在进行的对局
      wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'checkRunningGame' } })
        .then(res => {
          console.log('[DEBUG] checkRunningGame res:', res.result);
          if (res.result && res.result.success && res.result.roomId) {
            this.setData({
              showReconnectModal: true,
              reconnectContent: `检测到您有进行中的对局(房号:${res.result.roomId})，是否重连？`,
              reconnectRoomId: res.result.roomId
            });
          }
        })
        .catch(e => { console.error('Check running game failed', e); });
    }
  },

  onReconnectConfirm() {
    wx.showLoading({ title: '正在校验...', mask: true });
    // Re-verify room status before jumping
    wx.cloud.callFunction({ 
      name: 'quickstartFunctions', 
      data: { type: 'checkRunningGame' } 
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success && res.result.roomId === this.data.reconnectRoomId) {
        this.setData({ showReconnectModal: false });
        wx.navigateTo({ url: `/pages/room/room?roomId=${this.data.reconnectRoomId}` });
      } else {
        this.setData({ showReconnectModal: false });
        wx.showToast({ title: '房间已失效或已解散', icon: 'none' });
      }
    }).catch(e => {
      wx.hideLoading();
      console.error('Verify room failed', e);
      wx.showToast({ title: '网络繁忙，请稍后重试', icon: 'none' });
    });
  },

  onReconnectCancel() {
    this.setData({ showReconnectModal: false });
    wx.showLoading({ title: '正在退出...' });
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'quitGame', roomId: this.data.reconnectRoomId, abandon: true }
    }).then(() => {
      wx.showToast({ title: '已放弃对局', icon: 'none' });
    }).catch(e => {
      console.error('Quit game failed', e);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }).finally(() => { wx.hideLoading(); });
  },

  onCodeInput(e) {
    const index = e.currentTarget.dataset.index;
    let value = e.detail.value;

    if (value.length > 1) {
      value = value.charAt(value.length - 1);
    }

    const roomIdInputs = [...this.data.roomIdInputs];
    roomIdInputs[index] = value;

    const roomId = roomIdInputs.join('');
    
    let nextFocus = this.data.focusIndex;
    if (value && index < 3) {
      nextFocus = index + 1;
    } else if (!value && index > 0) {
      nextFocus = index - 1;
    } else if (index === 3 && value) {
      nextFocus = -1;
    }

    this.setData({
      roomIdInputs,
      roomId,
      focusIndex: nextFocus
    });
  },

  onJoinBtnClick() {
    if (this.data.roomId.length !== 4) {
      wx.showToast({
        title: '请输入4位房间号',
        icon: 'none'
      });
      return;
    }
    this.setData({ actionType: 'join' });
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.avatarUrl && userInfo.nickName) {
      this.doJoinRoom();
    } else {
      this.setData({ showAuthModal: true });
    }
  },

  onCreateBtnClick() {
    this.setData({ actionType: 'create' });
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.avatarUrl && userInfo.nickName) {
      this.doCreateRoom();
    } else {
      this.setData({ showAuthModal: true });
    }
  },

  // --- 授权相关 ---
  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl });
  },

  onNicknameChange(e) {
    this.setData({ tempNickname: e.detail.value });
  },

  closeAuthModal() {
    this.setData({ showAuthModal: false });
  },

  confirmAuth() {
    if (!this.data.tempAvatarUrl || !this.data.tempNickname) {
      wx.showToast({ title: '请完善信息', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '安全审核中...' });
    
    // 0. 内容安全审核
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'securityCheck', content: this.data.tempNickname }
    }).then(secRes => {
      if (secRes.result && !secRes.result.isSafe) {
        wx.hideLoading();
        wx.showModal({
          title: '审核不通过',
          content: '昵称包含敏感词，请修改',
          showCancel: false
        });
        throw new Error('SEC_CHECK_FAILED');
      }

      // 1. 上传头像
      const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png';
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: this.data.tempAvatarUrl,
      });
    }).then(uploadRes => {
      const userInfo = {
        nickName: this.data.tempNickname,
        avatarUrl: uploadRes.fileID
      };

      // 2. 保存到本地
      wx.setStorageSync('userInfo', userInfo);
      this.setData({ showAuthModal: false });

      // 3. 继续之前的操作
      if (this.data.actionType === 'create') {
        this.doCreateRoom();
      } else {
        this.doJoinRoom();
      }
    }).catch(err => {
      if (err.message !== 'SEC_CHECK_FAILED') {
        console.error('授权流程失败', err);
        wx.showToast({ title: '流程失败', icon: 'none' });
      }
    }).finally(() => {
      wx.hideLoading();
    });
  },

  // --- 核心逻辑 ---
  doJoinRoom() {
    this.setData({ joinLoading: true });
    wx.navigateTo({
      url: `/pages/room/room?roomId=${this.data.roomId}`,
      complete: () => {
        this.setData({ joinLoading: false });
      }
    });
  },

  doCreateRoom() {
    this.setData({ createLoading: true });
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'createRoom',
        config: {}
      }
    }).then(res => {
      if (res.result && res.result.success) {
        wx.navigateTo({
          url: `/pages/room/room?roomId=${res.result.roomId}`
        });
      } else {
        wx.showToast({ title: res.result.message || '创建失败', icon: 'none' });
      }
    }).catch(err => {
      console.error(err);
      wx.showModal({
        title: '创建失败',
        content: err.errMsg || JSON.stringify(err),
        showCancel: false
      });
    }).finally(() => {
      this.setData({ createLoading: false });
    });
  },

  goToRules() {
    wx.navigateTo({
      url: '/pages/rules/rules'
    });
  },

  goToMyRecords() {
    wx.navigateTo({
      url: '/pages/records/records'
    });
  }
});