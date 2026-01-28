// miniprogram/components/custom-modal/custom-modal.js
Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    content: { type: String, value: '' },
    showCancel: { type: Boolean, value: true },
    cancelText: { type: String, value: '取消' },
    confirmText: { type: String, value: '确定' },
    confirmColor: { type: String, value: '' }
  },
  methods: {
    onCancel() {
      this.triggerEvent('cancel');
      // Let parent handle closing via data binding if needed, or close internal state
      // this.setData({ show: false }); 
    },
    onConfirm() {
      this.triggerEvent('confirm');
      // this.setData({ show: false });
    },
    preventTouchMove() {}
  }
});
