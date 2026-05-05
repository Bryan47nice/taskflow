// === Theme — 主題切換管理 ===
const Theme = {
  THEMES: ['b-light', 'b-dark', 'c-light', 'c-dark'],
  LABELS: {
    'b-light': 'B·暖淺', 'b-dark': 'B·暖深',
    'c-light': 'C·銳淺', 'c-dark': 'C·銳深'
  },
  META_COLORS: {
    'b-light': '#F7F4F0', 'b-dark': '#1C1510',
    'c-light': '#F8F8F8', 'c-dark': '#0D0D0D'
  },

  init() {
    const saved = localStorage.getItem('tf-theme') || 'b-light';
    this.apply(saved, false);

    // 主題按鈕點擊
    document.getElementById('btn-theme').addEventListener('click', () => {
      if (window.innerWidth <= 600) {
        this.openSheet();
      } else {
        document.getElementById('theme-picker').classList.toggle('open');
      }
    });

    // 所有 data-theme-set 按鈕（下拉選單 + bottom sheet）
    document.querySelectorAll('[data-theme-set]').forEach(el => {
      el.addEventListener('click', () => this.apply(el.dataset.themeSet));
    });

    // 點擊 overlay 關閉 sheet
    document.getElementById('theme-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeSheet();
    });

    // 點擊外部關閉 desktop dropdown
    document.addEventListener('click', e => {
      if (!e.target.closest('.theme-wrap')) {
        document.getElementById('theme-picker').classList.remove('open');
      }
    });
  },

  apply(theme, save = true) {
    document.body.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('tf-theme', theme);

    // 更新按鈕 label
    const label = document.getElementById('theme-label');
    if (label) label.textContent = this.LABELS[theme];

    // 更新 logo 大小寫（C 主題全大寫）
    const logo = document.getElementById('app-logo');
    if (logo) logo.textContent = theme.startsWith('c') ? 'TASKFLOW' : 'TaskFlow';

    // 更新 meta theme-color
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.content = this.META_COLORS[theme];

    // 更新所有選項的 active 狀態（下拉 + sheet）
    document.querySelectorAll('[data-theme-set]').forEach(el => {
      el.classList.toggle('active', el.dataset.themeSet === theme);
    });

    this.closePicker();
    this.closeSheet();
  },

  closePicker() {
    document.getElementById('theme-picker').classList.remove('open');
  },
  openSheet() {
    document.getElementById('theme-overlay').classList.remove('hidden');
  },
  closeSheet() {
    document.getElementById('theme-overlay').classList.add('hidden');
  }
};
