// === Mobile Bottom Navigation ===
const MobileNav = {
  _current: 'board',

  switchTab(tab) {
    this._current = tab;
    const isMobile = window.innerWidth < 768;

    // Update button states
    document.querySelectorAll('.bnav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );

    if (!isMobile) return;

    const board = document.querySelector('.kanban-board');
    const panel = document.getElementById('side-panel');
    const mobileKanbanTabs = document.querySelector('.mobile-tabs');

    // Determine which panel cards to show
    const showCards = {
      board:  [],
      focus:  ['panel-timer'],
      stats:  ['panel-timeline', 'panel-stats'],
      notes:  ['panel-scratch']
    }[tab] || [];

    if (tab === 'board') {
      board?.classList.remove('hidden');
      mobileKanbanTabs?.classList.remove('hidden-mobile');
      panel?.classList.remove('mobile-visible');
      panel?.classList.add('hidden-mobile-panel');
    } else {
      board?.classList.add('hidden');
      mobileKanbanTabs?.classList.add('hidden-mobile');
      panel?.classList.remove('hidden-mobile-panel');
      panel?.classList.add('mobile-visible');

      // Show only relevant cards
      ['panel-timer','panel-timeline','panel-stats','panel-scratch'].forEach(id => {
        const card = document.getElementById(id);
        if (!card) return;
        card.style.display = showCards.includes(id) ? '' : 'none';
      });
    }
  },

  _onResize() {
    const isMobile = window.innerWidth < 768;
    const board = document.querySelector('.kanban-board');
    const panel = document.getElementById('side-panel');
    const mobileKanbanTabs = document.querySelector('.mobile-tabs');

    if (!isMobile) {
      // Reset to desktop layout
      board?.classList.remove('hidden');
      mobileKanbanTabs?.classList.remove('hidden-mobile');
      panel?.classList.remove('mobile-visible', 'hidden-mobile-panel');
      ['panel-timer','panel-timeline','panel-stats','panel-scratch'].forEach(id => {
        const c = document.getElementById(id); if (c) c.style.display = '';
      });
    } else {
      this.switchTab(this._current);
    }
  },

  init() {
    document.querySelectorAll('.bnav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }
};
