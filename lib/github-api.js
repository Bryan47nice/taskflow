// === GitHub Contents API wrapper ===
const GitHubAPI = {
  BASE: 'https://api.github.com',

  _headers(pat) {
    return {
      Authorization: `token ${pat}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
  },

  // Safely encode any string (including Unicode) to base64
  _encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin);
  },

  // Safely decode base64 that may contain Unicode
  _decode(b64) {
    const bin = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  },

  // GET a JSON file. Returns { content: parsedObject, sha } or { content: null, sha: null } if 404.
  async getJSON(pat, repo, path) {
    const res = await fetch(`${this.BASE}/repos/${repo}/contents/${path}`, {
      headers: this._headers(pat)
    });
    if (res.status === 404) return { content: null, sha: null };
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub GET ${path}: ${res.status} ${err.message || ''}`);
    }
    const data = await res.json();
    return { content: JSON.parse(this._decode(data.content)), sha: data.sha };
  },

  // GET a raw text file. Returns { content: string, sha } or { content: null, sha: null } if 404.
  async getRaw(pat, repo, path) {
    const res = await fetch(`${this.BASE}/repos/${repo}/contents/${path}`, {
      headers: this._headers(pat)
    });
    if (res.status === 404) return { content: null, sha: null };
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub GET ${path}: ${res.status} ${err.message || ''}`);
    }
    const data = await res.json();
    return { content: this._decode(data.content), sha: data.sha };
  },

  // PUT a JSON file. Returns the new sha.
  async putJSON(pat, repo, path, obj, sha, message) {
    return this.putRaw(pat, repo, path, JSON.stringify(obj, null, 2), sha, message);
  },

  // PUT a raw string file. Returns the new sha.
  async putRaw(pat, repo, path, text, sha, message) {
    const body = { message, content: this._encode(text) };
    if (sha) body.sha = sha;
    const res = await fetch(`${this.BASE}/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: this._headers(pat),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub PUT ${path}: ${res.status} ${err.message || ''}`);
    }
    const data = await res.json();
    return data.content.sha;
  },

  // LIST files in a directory. Returns array of { name, path, sha, type }.
  async listDir(pat, repo, path) {
    const res = await fetch(`${this.BASE}/repos/${repo}/contents/${path}`, {
      headers: this._headers(pat)
    });
    if (res.status === 404) return [];
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub LIST ${path}: ${res.status} ${err.message || ''}`);
    }
    return await res.json();
  },

  // Verify PAT + repo access. Returns true if OK.
  async ping(pat, repo) {
    const res = await fetch(`${this.BASE}/repos/${repo}`, {
      headers: this._headers(pat)
    });
    return res.ok;
  }
};
