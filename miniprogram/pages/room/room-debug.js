module.exports = Behavior({
    data: {
        showGodViewList: false, 
    },

    methods: {
        toggleGodView() {
            this.setData({ showGodViewList: !this.data.showGodViewList });
        }
    }
});