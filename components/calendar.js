// === Google Calendar Panel ===
const Calendar = {
  _tokenClient: null,
  _events: [],

  _saveCache(events) {
    localStorage.setItem('taskflow_gcal_events', JSON.stringify({ events, cachedAt: Date.now() }));
  },

  _loadCache() {
    const raw = localStorage.getItem('taskflow_gcal_events');
    if (!raw) return null;
    const { events, cachedAt } = JSON.parse(raw);
    if (new Date(cachedAt).toDateString() !== new Date().toDateString()) return null;
    return events;
  },

  init() {
    document.getElementById('btn-cal').addEventListener('click', () => this.toggle());
    document.getElementById('btn-cal-disconnect').addEventListener('click', () => this.disconnect());
    document.getElementById('btn-cal-refresh').addEventListener('click', () => this._loadEvents());

    if (GCalAPI.getToken()) {
      const cached = this._loadCache();
      document.getElementById('cal-panel').classList.remove('hidden');
      if (cached) {
        this._events = cached;
        this._renderEvents();
      } else {
        this._loadEvents();
      }
    }
  },

  toggle() {
    const panel = document.getElementById('cal-panel');
    if (panel.classList.contains('hidden')) {
      this._open();
    } else {
      panel.classList.add('hidden');
    }
  },

  async _open() {
    if (!GCalAPI.getToken()) { this._requestAuth(); return; }
    document.getElementById('cal-panel').classList.remove('hidden');
    await this._loadEvents();
  },

  _requestAuth() {
    const clientId = App.settings.calClientId;
    console.log('[Calendar] _requestAuth start', { clientId: clientId ? clientId.slice(0, 20) + '…' : '(empty)', origin: location.origin });
    if (!clientId) {
      App.showToast('請先在設定填入 Google Calendar OAuth Client ID', 'error');
      return;
    }
    if (typeof google === 'undefined') {
      console.warn('[Calendar] google object undefined — GSI script not loaded');
      App.showToast('Google 服務未載入，請確認網路連線', 'error');
      return;
    }
    if (!this._tokenClient) {
      console.log('[Calendar] initTokenClient', clientId.slice(0, 20) + '…');
      this._tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
        callback: resp => {
          if (resp.error) {
            console.error('[Calendar] OAuth error', resp.error, resp);
            App.showToast(`授權失敗：${resp.error}`, 'error');
            return;
          }
          console.log('[Calendar] OAuth success, token received');
          GCalAPI.setToken(resp.access_token, resp.expires_in);
          document.getElementById('cal-panel').classList.remove('hidden');
          this._loadEvents();
        }
      });
    }
    console.log('[Calendar] requestAccessToken');
    this._tokenClient.requestAccessToken();
  },

  async _loadEvents() {
    const btn = document.getElementById('btn-cal-refresh');
    btn.classList.add('is-loading');
    btn.disabled = true;
    this._setBody('<p class="cal-empty">載入中…</p>');
    try {
      this._events = await GCalAPI.getTodayEvents();
      this._saveCache(this._events);
      this._renderEvents();
      App._updateHeader();
    } catch (e) {
      this._events = [];
      if (e.message === 'token_expired') {
        this._setBody('<p class="cal-empty">連線已過期，請重新點擊 📅 連線</p>');
        GCalAPI.clearToken();
        this._tokenClient = null;
      } else {
        this._setBody('<p class="cal-empty">載入失敗，請稍後再試</p>');
      }
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  },

  disconnect() {
    const t = GCalAPI.getToken();
    if (t && typeof google !== 'undefined') google.accounts.oauth2.revoke(t, () => {});
    GCalAPI.clearToken();
    localStorage.removeItem('taskflow_gcal_events');
    this._events = [];
    this._tokenClient = null;
    document.getElementById('cal-panel').classList.add('hidden');
    App._updateHeader();
  },

  getMeetingMinutes() {
    return this._events.reduce((sum, ev) => {
      if (!ev.start?.dateTime) return sum;
      return sum + Math.round((new Date(ev.end.dateTime) - new Date(ev.start.dateTime)) / 60000);
    }, 0);
  },

  _renderEvents() {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = d => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    const rows = this._events.length
      ? this._events.map(ev => {
          const allDay = !ev.start?.dateTime;
          const time = allDay
            ? '全天'
            : `${fmt(new Date(ev.start.dateTime))}–${fmt(new Date(ev.end.dateTime))}`;
          return `<div class="cal-event${allDay ? ' cal-allday' : ''}">
            <span class="cal-time">${time}</span>
            <span class="cal-title">${esc(ev.summary || '（無標題）')}</span>
          </div>`;
        }).join('')
      : '<p class="cal-empty">今天沒有行事曆事件</p>';

    const meetMin = this.getMeetingMinutes();
    const badge = meetMin > 0
      ? `<span class="cal-meet-badge">會議 ${HonestLimit.formatTime(meetMin)}</span>`
      : '';

    this._setBody(badge + `<div class="cal-events">${rows}</div>`);
  },

  _setBody(html) {
    document.getElementById('cal-events-body').innerHTML = html;
  }
};
