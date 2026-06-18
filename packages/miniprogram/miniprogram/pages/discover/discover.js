const store = require('../../utils/store.js');
const { companionTypes, mockActivities } = require('../../utils/cards-data.js');

Page({
  data: {
    companionTypes: companionTypes,
    activities: [],
    filteredActivities: [],
    selectedCategory: null,
    showCreate: false,
    createTitle: '',
    createDesc: '',
    createLocation: '',
    createTime: '',
    createMaxParticipants: 4,
    createCategory: '',
    createSubcategory: '',
    isSubmitting: false,
    formErrors: {},
  },

  onLoad() {
    this.loadActivities();
  },

  onShow() {
    this.loadActivities();
  },

  loadActivities() {
    let activities = store.getActivities();
    if (activities.length === 0) {
      mockActivities.forEach(a => store.addActivity({ ...a, joined: false }));
      activities = store.getActivities();
    }
    const enriched = activities.map(a => {
      const cat = this.getCategoryInfo(a.category);
      return {
        ...a,
        _categoryColor: cat ? cat.color : '#a3a3a3',
        _categoryIcon: cat ? cat.icon : '',
        _categoryName: cat ? cat.name : '',
        _creatorInitial: this.getCreatorInitial(a.creator),
      };
    });
    const filtered = this.computeFiltered(enriched, this.data.selectedCategory);
    this.setData({ activities: enriched, filteredActivities: filtered });
  },

  computeFiltered(activities, selectedCategory) {
    if (!selectedCategory) return activities;
    return activities.filter(a => a.category === selectedCategory);
  },

  updateFilteredActivities() {
    const filtered = this.computeFiltered(this.data.activities, this.data.selectedCategory);
    this.setData({ filteredActivities: filtered });
  },

  selectCategory(e) {
    const cat = e.currentTarget.dataset.cat || null;
    const newSelected = this.data.selectedCategory === cat ? null : cat;
    this.setData({ selectedCategory: newSelected });
    this.updateFilteredActivities();
  },

  getCategoryInfo(categoryId) {
    return companionTypes.find(c => c.id === categoryId);
  },

  getCreatorInitial(name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  },

  getSubcategories() {
    const type = companionTypes.find(c => c.id === this.data.createCategory);
    return type ? type.subcategories : [];
  },

  joinActivity(e) {
    const id = e.currentTarget.dataset.id;
    store.joinActivity(id);
    this.loadActivities();
    wx.showToast({ title: '已加入', icon: 'success', duration: 1500 });
  },

  leaveActivity(e) {
    const id = e.currentTarget.dataset.id;
    store.leaveActivity(id);
    this.loadActivities();
    wx.showToast({ title: '已退出', icon: 'success', duration: 1500 });
  },

  openCreate() {
    this.setData({
      showCreate: true,
      formErrors: {},
      createCategory: '',
      createSubcategory: '',
    });
  },

  closeCreate() {
    this.setData({ showCreate: false, formErrors: {} });
  },

  onCreateTitle(e) {
    this.setData({ createTitle: e.detail.value });
    if (this.data.formErrors.title) {
      this.setData({ 'formErrors.title': '' });
    }
  },
  onCreateDesc(e) { this.setData({ createDesc: e.detail.value }); },
  onCreateLocation(e) {
    this.setData({ createLocation: e.detail.value });
    if (this.data.formErrors.location) {
      this.setData({ 'formErrors.location': '' });
    }
  },
  onCreateTime(e) {
    this.setData({ createTime: e.detail.value });
    if (this.data.formErrors.time) {
      this.setData({ 'formErrors.time': '' });
    }
  },
  onCreateMax(e) { this.setData({ createMaxParticipants: parseInt(e.detail.value) || 4 }); },
  onCreateCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    this.setData({
      createCategory: cat,
      createSubcategory: '',
      'formErrors.category': '',
    });
  },
  onCreateSubcategory(e) {
    this.setData({ createSubcategory: e.currentTarget.dataset.sub });
  },

  validateForm() {
    const errors = {};
    const { createTitle, createLocation, createTime, createCategory } = this.data;
    if (!createTitle.trim()) errors.title = '请输入活动标题';
    if (!createLocation.trim()) errors.location = '请输入活动地点';
    if (!createTime.trim()) errors.time = '请输入活动时间';
    if (!createCategory) errors.category = '请选择活动分类';
    this.setData({ formErrors: errors });
    return Object.keys(errors).length === 0;
  },

  noop() {},

  submitCreate() {
    if (this.data.isSubmitting) return;
    if (!this.validateForm()) return;
    this.setData({ isSubmitting: true });

    const profile = store.getProfile();
    store.addActivity({
      title: this.data.createTitle.trim(),
      description: this.data.createDesc.trim(),
      location: this.data.createLocation.trim(),
      time: this.data.createTime.trim(),
      maxParticipants: this.data.createMaxParticipants,
      category: this.data.createCategory,
      subcategory: this.data.createSubcategory || '',
      avatar: '',
      creator: profile.name || '匿名',
    });

    wx.showToast({ title: '创建成功', icon: 'success', duration: 1500 });

    this.setData({
      showCreate: false,
      isSubmitting: false,
      createTitle: '',
      createDesc: '',
      createLocation: '',
      createTime: '',
      createMaxParticipants: 4,
      createCategory: '',
      createSubcategory: '',
      formErrors: {},
    });
    this.loadActivities();
  },
});
