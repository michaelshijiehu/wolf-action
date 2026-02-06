// pages/setup/setup.js

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
  }
});
