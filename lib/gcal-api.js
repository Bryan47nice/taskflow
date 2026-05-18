// === Google Calendar API Wrapper ===
const GCalAPI = {
  _token: null,

  getToken() {
    if (!this._token) {
      const stored = JSON.parse(localStorage.getItem('taskflow_gcal_token') || 'null');
      if (stored && Date.now() < stored.exp) this._token = stored.token;
      else if (stored) localStorage.removeItem('taskflow_gcal_token');
    }
    return this._token;
  },

  setToken(token, expiresIn = 3600) {
    this._token = token;
    const exp = Date.now() + (expiresIn - 60) * 1000;
    localStorage.setItem('taskflow_gcal_token', JSON.stringify({ token, exp }));
  },

  clearToken() {
    this._token = null;
    localStorage.removeItem('taskflow_gcal_token');
  },

  async getTodayEvents() {
    const token = this.getToken();
    if (!token) throw new Error('not_authenticated');

    const today = new Date();
    const tMin = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 30).toISOString();
    const tMax = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0).toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}` +
      `&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 401) { this.clearToken(); throw new Error('token_expired'); }
    if (!res.ok) throw new Error(`api_${res.status}`);

    const data = await res.json();
    return data.items || [];
  }
};
