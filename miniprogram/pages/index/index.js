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

  onShow: async function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      // 每次回到大厅都检查是否有正在进行的对局
      try {
        const res = await wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'checkRunningGame' } });
        console.log('[DEBUG] checkRunningGame res:', res.result);
        if (res.result && res.result.success && res.result.roomId) {
          this.setData({
            showReconnectModal: true,
            reconnectContent: `检测到您有进行中的对局(房号:${res.result.roomId})，是否重连？`,
            reconnectRoomId: res.result.roomId
          });
        }
      } catch (e) { console.error('Check running game failed', e); }
    }
  },

  onReconnectConfirm() {
    this.setData({ showReconnectModal: false });
    wx.navigateTo({ url: `/pages/room/room?roomId=${this.data.reconnectRoomId}` });
  },

  onReconnectCancel() {
    this.setData({ showReconnectModal: false });
    // Double check before quitting (using system modal for safety or custom modal again?)
    // For simplicity, let's use system modal for the "Are you sure?" second check to avoid complex state management
    // Or just trust the first cancel.
    // Let's implement the abandon logic directly.
    wx.showLoading({ title: '正在退出...' });
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'quitGame', roomId: this.data.reconnectRoomId, abandon: true }
    }).then(() => {
      wx.showToast({ title: '已放弃对局', icon: 'none' });
    }).finally(() => { wx.hideLoading(); });
  },

  onCodeInput(e) {
    const index = e.currentTarget.dataset.index;
    let value = e.detail.value;

    // Ensure only one character
    if (value.length > 1) {
      value = value.charAt(value.length - 1);
    }

    this.data.roomIdInputs[index] = value;

    const roomId = this.data.roomIdInputs.join('');
    this.setData({
      roomIdInputs: this.data.roomIdInputs,
      roomId: roomId
    });

    if (value && index < 3) {
      // Shift focus to the next input after a slight delay
      setTimeout(() => {
        this.setData({
          focusIndex: index + 1
        });
      }, 50); // Small delay
    } else if (!value && index > 0) { // If value cleared (e.g., by backspace) and not first input
      // Shift focus to the previous input after a slight delay
      setTimeout(() => {
        this.setData({
          focusIndex: index - 1
        });
      }, 50); // Small delay
    } else if (index === 3 && value) { // If last input and value entered, clear focus
      this.setData({
        focusIndex: -1 // Blur all inputs
      });
    }
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

  async confirmAuth() {
    if (!this.data.tempAvatarUrl || !this.data.tempNickname) {
      wx.showToast({ title: '请完善信息', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '安全审核中...' });
    try {
      // 0. 内容安全审核
      const secRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'securityCheck', content: this.data.tempNickname }
      });

      if (secRes.result && !secRes.result.isSafe) {
        wx.hideLoading();
        wx.showModal({
          title: '审核不通过',
          content: '昵称包含敏感词，请修改',
          showCancel: false
        });
        return;
      }

      // 1. 上传头像
      const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png';
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: this.data.tempAvatarUrl,
      });

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

    } catch (err) {
      console.error('上传头像失败', err);
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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

  async doCreateRoom() {
    this.setData({ createLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'createRoom',
          config: {}
        }
      });

      if (res.result && res.result.success) {
        wx.navigateTo({
          url: `/pages/room/room?roomId=${res.result.roomId}`
        });
      } else {
        wx.showToast({ title: res.result.message || '创建失败', icon: 'none' });
      }
    } catch (err) {
      console.error(err);
      wx.showModal({
        title: '创建失败',
        content: err.errMsg || JSON.stringify(err),
        showCancel: false
      });
    } finally {
      this.setData({ createLoading: false });
    }
  },

  // --- 导航到游戏规则 ---
  goToRules() {
    wx.navigateTo({
      url: '/pages/rules/rules'
    });
  },

  // --- 导航到我的对局记录 ---
  goToMyRecords() {
    wx.navigateTo({
      url: '/pages/records/records'
    });
  }
});
