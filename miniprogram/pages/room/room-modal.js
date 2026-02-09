module.exports = Behavior({
  methods: {
    // --- Custom Modal Logic ---
    showCustomModal({ title, content, showCancel = true, confirmText = '确定', cancelText = '取消', confirmColor = '', success }) {
      this.setData({
        modalConfig: { show: true, title, content, showCancel, confirmText, cancelText, confirmColor }
      });
      this._modalCallbacks = success;
    },

    onModalConfirm() {
      if (this._modalCallbacks) this._modalCallbacks({ confirm: true, cancel: false });
      this.setData({ 'modalConfig.show': false });
    },

    onModalCancel() {
      if (this._modalCallbacks) this._modalCallbacks({ confirm: false, cancel: true });
      this.setData({ 'modalConfig.show': false });
    }
  }
});
