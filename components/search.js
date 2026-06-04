// === Search — 指令面板：搜尋目前卡片 + 近 5 天日誌 ===
const Search = {
  _journals: [],          // [{date, label, content}]
  _journalState: 'idle',  // 'idle'|'loading'|'loaded'|'error'|'no-conn'
  _expanded: {},          // {date: true}
  _loadToken: 0,

  open() {
    document.getElementById('modal-search').classList.remove('hidden');
    const input = document.getElementById('search-input');
    input.value = '';
    input.focus();
    this._expanded = {};
    this._journalState = 'idle';
    this._render();
    this._loadJournals();
  },

  close() { document.getElementById('modal-search').classList.add('hidden'); },

  isOpen() { return !document.getElementById('modal-search').classList.contains('hidden'); },

  _onInput() { this._render(); },

  _query() { return (document.getElementById('search-input').value || '').trim(); },

  // ── 渲染（最終版，後續 task 只填資料函式）──
  _render() {
    const q = this._query();
    const el = document.getElementById('search-results');
    if (!q) {
      const hint = this._journalState === 'loaded' ? '已預載近 5 天日誌 ✓'
        : this._journalState === 'loading' ? '載入近 5 天日誌中…'
        : this._journalState === 'no-conn' ? '未連線 GitHub，僅搜尋目前卡片'
        : this._journalState === 'error' ? '日誌載入失敗' : '';
      el.innerHTML = `<div class="search-empty">輸入關鍵字搜尋目前卡片與近 5 天日誌${hint ? `<div class="search-hint">${hint}</div>` : ''}</div>`;
      return;
    }
    const cards = this._searchCards(q);
    const journals = this._journalState === 'loaded' ? this._searchJournals(q) : [];

    if (cards.length === 0 && this._journalState === 'loaded' && journals.length === 0) {
      el.innerHTML = `<div class="search-empty">找不到符合「${this._esc(q)}」的結果</div>`;
      return;
    }

    let html = `<div class="search-group">目前卡片 · ${cards.length}</div>`;
    html += cards.length
      ? cards.map(c => `
          <div class="search-row" data-kind="card" data-id="${this._esc(c.task.id)}">
            <div class="search-row-title">${this._hl(c.task.title, q)}</div>
            ${c.snippet ? `<div class="search-row-sub">${this._esc(c.snippet.label)}：${this._hl(this._clip(c.snippet.val, q), q)}</div>` : ''}
          </div>`).join('')
      : `<div class="search-none">無符合卡片</div>`;

    html += `<div class="search-group">近 5 天日誌${this._journalState === 'loaded' ? ` · ${journals.length}` : ''}</div>`;
    if (this._journalState === 'loading') {
      html += `<div class="search-status">⏳ 載入日誌中…</div>`;
    } else if (this._journalState === 'no-conn') {
      html += `<div class="search-status warn">⚠ 未連線 GitHub，無法搜尋日誌</div>`;
    } else if (this._journalState === 'error') {
      html += `<div class="search-status warn">日誌載入失敗</div>`;
    } else if (journals.length) {
      html += journals.map(j => `
        <div class="search-row" data-kind="journal" data-date="${j.date}">
          <div class="search-row-title">${j.date}（週${j.label}）<span class="search-expand">${this._expanded[j.date] ? '▾ 收合' : '▸ 展開'}</span></div>
          <div class="search-row-sub">${this._hl(j.lines[0], q)}</div>
          ${this._expanded[j.date] ? `<div class="search-context">${this._contextHtml(j.content, q)}</div>` : ''}
        </div>`).join('');
    } else {
      html += `<div class="search-none">無符合日誌</div>`;
    }

    el.innerHTML = html;
    el.querySelectorAll('.search-row[data-kind="card"]').forEach(row =>
      row.addEventListener('click', () => this._openCard(row.dataset.id)));
    el.querySelectorAll('.search-row[data-kind="journal"]').forEach(row =>
      row.addEventListener('click', () => { const d = row.dataset.date; this._expanded[d] = !this._expanded[d]; this._render(); }));
  },

  // ── 卡片搜尋（全欄位）──
  _searchCards(q) {
    const ql = q.toLowerCase();
    const out = [];
    for (const t of (App.tasks || [])) {
      const fields = [];
      if (t.title) fields.push(['標題', t.title]);
      if (t.body) fields.push(['內文', t.body]);
      if (t.pdca) ['plan','do','check','act'].forEach(k => { if (t.pdca[k]) fields.push(['PDCA', t.pdca[k]]); });
      if (t.source && t.source.snippet) fields.push(['來源', t.source.snippet]);
      if (Array.isArray(t.links)) t.links.forEach(l => {
        const s = typeof l === 'string' ? l : (l && (l.name || l.url)) || '';
        if (s) fields.push(['連結', s]);
      });
      let titleHit = false, snippet = null;
      for (const [label, val] of fields) {
        if (String(val).toLowerCase().includes(ql)) {
          if (label === '標題') titleHit = true;
          else if (!snippet) snippet = { label, val: String(val) };
        }
      }
      if (titleHit || snippet) out.push({ task: t, snippet });
    }
    return out;
  },

  _openCard(id) {
    const task = (App.tasks || []).find(t => t.id === id);
    if (!task) return;
    this.close();
    if (typeof PDCA !== 'undefined') PDCA.show(task);
    const card = document.querySelector(`.task-card[data-id="${id}"]`);
    if (card) {
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.add('search-flash');
      setTimeout(() => card.classList.remove('search-flash'), 1500);
    }
  },

  // ── 近 5 天日誌 ──
  async _loadJournals() {
    const { pat, repo } = App.settings;
    if (!pat || !repo) { this._journalState = 'no-conn'; this._journals = []; this._render(); return; }
    this._journalState = 'loading';
    this._journals = [];
    this._render();
    const token = ++this._loadToken;
    const dates = this._recentDates(5);
    const out = [];
    try {
      for (const date of dates) {
        const res = await GitHubAPI.getRaw(pat, repo, `taskflow/journal/${date}.md`);
        if (token !== this._loadToken) return; // 已被新的 open 取代
        if (res.content) out.push({ date, label: this._weekdayLabel(date), content: res.content });
      }
      if (token !== this._loadToken) return;
      this._journals = out;
      this._journalState = 'loaded';
    } catch (_) {
      if (token !== this._loadToken) return;
      this._journalState = 'error';
    }
    this._render();
  },

  _searchJournals(q) {
    const ql = q.toLowerCase();
    const out = [];
    for (const j of this._journals) {
      const lines = j.content.split('\n').filter(l => l.trim() && l.toLowerCase().includes(ql));
      if (lines.length) out.push({ date: j.date, label: j.label, lines, content: j.content });
    }
    return out;
  },

  // ── 渲染輔助 ──
  _recentDates(n) {
    const out = [];
    const base = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(base); d.setDate(base.getDate() - i);
      out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
    return out;
  },
  _weekdayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return ['日','一','二','三','四','五','六'][d.getDay()];
  },
  _clip(val, q) {
    const s = String(val); const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return s.slice(0, 60);
    const start = Math.max(0, i - 20);
    return (start > 0 ? '…' : '') + s.slice(start, i + q.length + 40) + (i + q.length + 40 < s.length ? '…' : '');
  },
  _contextHtml(content, q) { return this._hl(content, q).replace(/\n/g, '<br>'); },
  _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  _hl(raw, q) {
    const safe = this._esc(raw);
    if (!q) return safe;
    const qEsc = this._esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(qEsc, 'gi'), m => `<mark>${m}</mark>`);
  },

  init() {
    document.getElementById('btn-search').addEventListener('click', () => this.open());
    document.getElementById('search-input').addEventListener('input', () => this._onInput());
    document.getElementById('modal-search').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-search')) this.close();
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        this.open();
        return;
      }
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }
};
