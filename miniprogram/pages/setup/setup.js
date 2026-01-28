// pages/setup/setup.js
const AUDIO_SCRIPTS = require('../../constants/audioScripts');

const TEMPLATES = [
  {
    label: '6人局',
    desc: '2狼 2民 预女',
    config: { werewolf: 2, villager: 2, seer: true, witch: true, hunter: false, idiot: false, guard: false, cupid: false }
  },
  {
    label: '9人局',
    desc: '3狼 3民 预女猎',
    config: { werewolf: 3, villager: 3, seer: true, witch: true, hunter: true, idiot: false, guard: false, cupid: false }
  },
  {
    label: '10人局',
    desc: '3狼 4民 预女猎',
    config: { werewolf: 3, villager: 4, seer: true, witch: true, hunter: true, idiot: false, guard: false, cupid: false }
  },
  {
    label: '12人局',
    desc: '4狼 4民 预女猎白',
    config: { werewolf: 4, villager: 4, seer: true, witch: true, hunter: true, idiot: true, guard: false, cupid: false }
  }
];

Page({
  data: {
    totalSeats: 12,
    config: {
      werewolf: 4,
      villager: 4,
      seer: true,
      witch: true,
      hunter: true,
      idiot: true,
      guard: false,
      cupid: false,
      knight: false, bear: false, merchant: false, silencer: false, gravekeeper: false, magician: false, dream_catcher: false,
      wolf_king: false, wolf_beauty: false, hidden_wolf: false, gargoyle: false,
      wild_child: false, bomberman: false
    },
    currentCount: 0, // 实际配置的总人数
    templates: TEMPLATES
  },

  onLoad(options) {
    if (options.config) {
      try {
        const prevConfig = JSON.parse(decodeURIComponent(options.config));
        this.setData({
          config: prevConfig
        });
      } catch (e) { console.error(e); }
    }
    this.recalc();
  },

  // 应用模板
  applyTemplate(e) {
    const idx = e.currentTarget.dataset.index;
    const tpl = this.data.templates[idx];
    if (tpl) {
      this.setData({ config: { ...tpl.config } });
      this.recalc();
      wx.showToast({ title: `已应用${tpl.label}`, icon: 'none' });
    }
  },

  // 角色数量变更
  updateRole(e) {
    const { role, op } = e.currentTarget.dataset;
    const config = this.data.config;
    config[role] = Math.max(0, config[role] + Number(op));
    this.setData({ config });
    this.recalc();
  },

  // 神职开关
  toggleGod(e) {
    const role = e.currentTarget.dataset.role;
    const config = this.data.config;
    config[role] = !config[role];
    this.setData({ config });
    this.recalc();
  },

  recalc() {
    const c = this.data.config;
    let sum = c.werewolf + c.villager;
    if (c.seer) sum++;
    if (c.witch) sum++;
    if (c.hunter) sum++;
    if (c.idiot) sum++;
    if (c.guard) sum++;
    if (c.cupid) sum++;
    ['knight', 'bear', 'merchant', 'silencer', 'gravekeeper', 'magician', 'dream_catcher', 'wolf_king', 'wolf_beauty', 'hidden_wolf', 'gargoyle', 'wild_child', 'bomberman'].forEach(key => {
      if (c[key]) sum++;
    });
    this.setData({ currentCount: sum, totalSeats: sum });
  },

  onConfirm() {
    if (this.data.currentCount <= 0) {
      wx.showToast({ title: '人数必须大于0', icon: 'none' });
      return;
    }

    // 返回上一页并传递数据
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];

    if (prevPage) {
      prevPage.updateGameConfig(this.data.totalSeats, this.data.config);
    }

    wx.navigateBack();
  },

  async onPrepareAudio() {
    wx.showLoading({ title: '资源准备中...', mask: true });

    // 提取所有静态文本
    const texts = [];
    const traverse = (obj) => {
      Object.values(obj).forEach(val => {
        if (typeof val === 'string') {
          texts.push(val);
        } else if (typeof val === 'object' && val !== null) {
          if (val.text && typeof val.text === 'string') {
            texts.push(val.text); // 如 GAME_START: { text: ... }
          }
          traverse(val);
        }
      });
    };
    traverse(AUDIO_SCRIPTS);

    // 补充一些无法直接遍历到的常用动态文本
    texts.push("昨晚，是平安夜。");

    // 去重
    const uniqueTexts = [...new Set(texts)];
    console.log('Preparing audios:', uniqueTexts);

    try {
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: {
          type: 'prepareAllAudio'
        }
      });

      console.log('Batch Prepare Result:', res);

      if (res.result && res.result.success) {
        wx.showModal({
          title: '准备成功',
          content: res.result.message,
          showCancel: false,
        });
      } else {
        wx.showModal({
          title: '准备失败',
          content: (res.result && res.result.message) ? res.result.message : '未知错误，请检查云函数日志。',
          showCancel: false,
        });
      }
    } catch (e) {
      console.error(e);
      wx.showModal({
        title: '调用出错',
        content: e.errMsg || '请检查网络和云函数状态',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  }
});
