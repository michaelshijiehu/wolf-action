// pages/usercenter/usercenter.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    showEditModal: false,
    tempAvatarUrl: '',
    tempNickname: '',
    saveLoading: false,
    stats: {
      total: 0,
      wins: 0,
      winRate: '0%'
    },
    recentRecord: null,
    menuItems: [
      { id: 'records', title: '比赛记录', icon: '📜', path: '/pages/records/records' },
      { id: 'rules', title: '游戏规则', icon: '📖', path: '/pages/rules/rules' },
      { id: 'feedback', title: '意见反馈', icon: '💬', type: 'feedback' }
    ]
  },

  onShow() {
    this.getUserInfo();
    this.fetchUserStats();
  },

  getUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo: userInfo });
    }
  },

  // --- Edit Profile Logic ---
  onEditProfile() {
    this.setData({
      showEditModal: true,
      tempAvatarUrl: this.data.userInfo?.avatarUrl || '',
      tempNickname: this.data.userInfo?.nickName || ''
    });
  },

  closeEditModal() {
    this.setData({ showEditModal: false });
  },

  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl });
  },

  onNicknameChange(e) {
    this.setData({ tempNickname: e.detail.value });
  },

  saveProfile() {
    const { tempAvatarUrl, tempNickname, userInfo } = this.data;
    if (!tempAvatarUrl || !tempNickname) {
      wx.showToast({ title: '请完善信息', icon: 'none' });
      return;
    }

    this.setData({ saveLoading: true });
    
    // 1. 安全审核
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'securityCheck', content: tempNickname }
    }).then(secRes => {
      if (secRes.result && !secRes.result.isSafe) {
        wx.showModal({ title: '提醒', content: '昵称包含敏感词', showCancel: false });
        // Stop chain
        return Promise.reject('Content security check failed'); 
      }
      
      // 2. 上传头像 (如果是新选的临时路径)
      if (tempAvatarUrl.startsWith('http://tmp/') || tempAvatarUrl.startsWith('wxfile://')) {
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
        return wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempAvatarUrl
        }).then(uploadRes => {
          return uploadRes.fileID;
        });
      } else {
        return Promise.resolve(tempAvatarUrl);
      }
    }).then(finalAvatarUrl => {
      // 3. 更新本地缓存
      const newUserInfo = Object.assign({}, userInfo, {
        nickName: tempNickname,
        avatarUrl: finalAvatarUrl
      });
      wx.setStorageSync('userInfo', newUserInfo);

      this.setData({
        userInfo: newUserInfo,
        showEditModal: false,
        saveLoading: false
      });
      wx.showToast({ title: '修改成功', icon: 'success' });
    }).catch(e => {
      if (e === 'Content security check failed') {
         this.setData({ saveLoading: false });
         return;
      }
      console.error('Save profile failed', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ saveLoading: false });
    });
  },

  fetchUserStats() {
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'getUserStats' }
    }).then(res => {
      if (res.result && res.result.success && res.result.stats) {
        this.setData({
          stats: res.result.stats,
          recentRecord: res.result.recentRecord || null
        });
      }
    }).catch(e => {
      console.error('Fetch stats failed', e);
    });
  },

  onTapMenuItem(e) {
    const { path, type } = e.currentTarget.dataset;
    if (type === 'feedback') {
      wx.navigateTo({ url: '/pages/feedback/feedback' });
    } else if (path) {
      wx.navigateTo({ url: path });
    }
  },

  onTapRecent() {
    if (this.data.recentRecord) {
      wx.navigateTo({
        url: `/pages/recordDetail/recordDetail?id=${this.data.recentRecord._id}`
      });
    }
  }
});