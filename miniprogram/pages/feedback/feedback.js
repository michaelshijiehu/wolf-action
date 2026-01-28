// miniprogram/pages/feedback/feedback.js
Page({
  data: {
    content: '',
    contact: ''
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  async submit() {
    if (!this.data.content.trim()) return;

    wx.showLoading({ title: '提交中...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'submitFeedback',
          content: this.data.content,
          contact: this.data.contact,
          userInfo: userInfo
        }
      });

      if (res.result && res.result.success) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: '提交失败', icon: 'none' });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
