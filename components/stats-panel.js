// === Stats Panel (時間軸 + 統計) ===
const StatsPanel = {

  refresh() {
    this._renderTimeline();
    this._renderStats();
    this._renderHeatmap();
  },

  // ── 今日時間軸 ────────────────────────────────────────────────────
  _renderTimeline() {
    const el = document.getElementById('panel-timeline');
    if (!el) return;
    const today = (typeof App !== 'undefined') ? App.getTodayKey() : new Date().toISOString().slice(0,10);
    const tasks = (typeof App !== 'undefined' ? App.tasks : [])
      .filter(t => t.deadline === 'today' || t.dayKey === today || t.deadline === today);

    const startHour = 9, endHour = 19, totalMins = (endHour - startHour) * 60;
    const nowMins = this._nowMins();
    const inRange = nowMins >= startHour * 60 && nowMins <= endHour * 60;
    const nowPct = inRange ? ((nowMins - startHour * 60) / totalMins * 100) : null;

    // Build time blocks (stack tasks sequentially from 9am)
    let cursor = startHour * 60;
    const blocks = tasks.map(t => {
      const dur = this._estimateMins(t.estimate);
      const left = Math.min(100, ((cursor - startHour * 60) / totalMins) * 100);
      const width = Math.min(100 - left, (dur / totalMins) * 100);
      cursor += dur;
      return { task: t, left, width };
    });

    const hourLabels = [9, 12, 15, 19].map(h =>
      `<span style="left:${((h - startHour) / (endHour - startHour)) * 100}%">${h}</span>`
    ).join('');

    el.innerHTML = `
      <div class="side-card-header">🕘 今日時間軸</div>
      <div class="timeline-wrap">
        <div class="timeline-track">
          ${blocks.map(b => `
            <div class="timeline-block urg-${b.task.urgency}${b.task.status === 'done' ? ' done' : ''}"
              style="left:${b.left}%;width:${Math.max(b.width, 2)}%"
              title="${this._esc(b.task.title)} (${b.task.estimate})">
              ${b.task.status === 'done' ? '✓' : ''}
            </div>`).join('')}
          ${nowPct !== null ? `<div class="timeline-now" style="left:${nowPct}%"></div>` : ''}
        </div>
        <div class="timeline-labels">${hourLabels}</div>
      </div>
      <div class="timeline-legend">
        ${tasks.length === 0 ? '<span class="muted">今日無任務</span>' :
          `${tasks.filter(t=>t.status==='done').length} / ${tasks.length} 完成`}
      </div>`;
  },

  // ── 本週統計 ──────────────────────────────────────────────────────
  _renderStats() {
    const el = document.getElementById('panel-stats');
    if (!el) return;
    const log = JSON.parse(localStorage.getItem('taskflow_daily_log') || '{}');
    const tasks = (typeof App !== 'undefined' ? App.tasks : []);

    // Last 7 days bar chart
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const label = ['日','一','二','三','四','五','六'][d.getDay()];
      const entry = log[key] || { done: 0, scheduled: 0 };
      days.push({ key, label, ...entry, isToday: i === 0 });
    }
    const maxDone = Math.max(1, ...days.map(d => d.done));

    const barsHtml = days.map(d => `
      <div class="stat-bar-col${d.isToday ? ' today' : ''}">
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="height:${Math.round((d.done / maxDone) * 100)}%"></div>
        </div>
        <div class="stat-bar-label">${d.label}</div>
      </div>`).join('');

    // Accuracy
    const withActual = tasks.filter(t => t.actualMinutes > 0 && t.estimate);
    const accuracy = withActual.length
      ? Math.round(withActual.reduce((acc, t) => {
          const est = this._estimateMins(t.estimate);
          return acc + Math.min(t.actualMinutes, est) / est;
        }, 0) / withActual.length * 100)
      : null;

    // Tag distribution
    const tagMap = {};
    tasks.filter(t => t.source?.type).forEach(t => {
      const tag = t.source.type.toUpperCase();
      tagMap[tag] = (tagMap[tag] || 0) + this._estimateMins(t.estimate);
    });
    const tagTotal = Object.values(tagMap).reduce((a, b) => a + b, 0) || 1;
    const tagHtml = Object.entries(tagMap).slice(0, 4).map(([tag, mins]) =>
      `<div class="stat-tag-row">
        <span class="stat-tag-name">${tag}</span>
        <div class="stat-tag-bar"><div class="stat-tag-fill" style="width:${Math.round(mins/tagTotal*100)}%"></div></div>
        <span class="stat-tag-pct">${Math.round(mins/tagTotal*100)}%</span>
      </div>`
    ).join('');

    el.innerHTML = `
      <div class="side-card-header">📊 本週統計</div>
      <div class="stat-bars">${barsHtml}</div>
      ${accuracy !== null ? `
        <div class="stat-accuracy">
          <span class="stat-accuracy-label">估時準確度</span>
          <span class="stat-accuracy-val">${accuracy}%</span>
          <div class="stat-accuracy-bar">
            <div class="stat-accuracy-fill" style="width:${accuracy}%"></div>
          </div>
        </div>` : ''}
      ${tagHtml ? `<div class="stat-tags">${tagHtml}</div>` : ''}`;
  },

  // ── 熱力圖 ────────────────────────────────────────────────────────
  _renderHeatmap() {
    const el = document.getElementById('panel-heatmap');
    if (!el) return;
    const log = JSON.parse(localStorage.getItem('taskflow_daily_log') || '{}');
    const maxVal = Math.max(1, ...Object.values(log).map(d => d.done));

    const cells = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const val = log[key]?.done || 0;
      const level = val === 0 ? 0 : Math.ceil((val / maxVal) * 4);
      cells.push(`<div class="hm-cell lv${level}" title="${key}: ${val} 個完成"></div>`);
    }

    el.innerHTML = `
      <div class="side-card-header">📅 近 90 天</div>
      <div class="hm-grid">${cells.join('')}</div>
      <div class="hm-legend">
        <span>少</span>
        <div class="hm-cell lv0"></div>
        <div class="hm-cell lv1"></div>
        <div class="hm-cell lv2"></div>
        <div class="hm-cell lv3"></div>
        <div class="hm-cell lv4"></div>
        <span>多</span>
      </div>`;
  },

  // ── Helpers ───────────────────────────────────────────────────────
  _nowMins() {
    const n = new Date(); return n.getHours() * 60 + n.getMinutes();
  },

  _estimateMins(est) {
    if (!est) return 30;
    if (est.endsWith('h+') || est === '4h+') return 240;
    if (est.endsWith('h')) return parseFloat(est) * 60;
    if (est.endsWith('m')) return parseInt(est);
    return 30;
  },

  _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },

  init() { this.refresh(); }
};
