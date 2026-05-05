// ============================================================
// Mock Mode — 本機預覽用，完全繞過 GitHub API
// 資料存在 localStorage['mock_tasks']
// ============================================================
(function () {
  const STORAGE_KEY = 'mock_tasks';
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  const DEFAULT_TASKS = [
    {
      id: 'mock-1',
      title: '整理 Q2 產品路線圖',
      body: '需要與 PM 對齊優先順序，確認 Q2 主線功能列表。',
      links: [],
      urgency: 'high',
      estimate: '2h',
      deadline: 'today',
      status: 'in-progress',
      done: false,
      source: null,
      pdca: { plan: '先列出所有待排功能，按 impact/effort 矩陣排序', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(),
      completedAt: null,
      dayKey: today
    },
    {
      id: 'mock-2',
      title: '修復登入頁面 Safari 渲染問題',
      body: '',
      links: [],
      urgency: 'high',
      estimate: '1h',
      deadline: 'today',
      status: 'todo',
      done: false,
      source: { type: 'jira', url: 'https://example.atlassian.net/browse/FE-123', snippet: '' },
      pdca: { plan: '', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(),
      completedAt: null,
      dayKey: today
    },
    {
      id: 'mock-3',
      title: '更新 README 部署文件',
      body: '',
      links: [],
      urgency: 'low',
      estimate: '30m',
      deadline: 'backlog',
      status: 'todo',
      done: false,
      source: null,
      pdca: { plan: '', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(),
      completedAt: null,
      dayKey: today
    },
    {
      id: 'mock-4',
      title: '完成 onboarding flow 設計稿 review',
      body: '',
      links: [],
      urgency: 'medium',
      estimate: '1h',
      deadline: 'tomorrow',
      status: 'todo',
      done: false,
      source: { type: 'notion', url: '', snippet: '' },
      pdca: { plan: '', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(),
      completedAt: null,
      dayKey: today
    },
    {
      id: 'mock-5',
      title: '每日站會準備',
      body: '',
      links: [],
      urgency: 'medium',
      estimate: '15m',
      deadline: 'today',
      status: 'done',
      done: true,
      source: null,
      pdca: { plan: '列出昨日進度與今日計畫', do: '已整理好三點更新', check: '準備充分', act: '' },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      dayKey: today
    }
  ];

  // ── 注入假設定，讓 App 跳過設定視窗 ──────────────────────
  const FAKE_SETTINGS = {
    pat: 'mock-pat',
    repo: 'mock-user/mock-repo',
    dailyHours: 8,
    claudeKey: ''
  };
  localStorage.setItem('taskflow_settings', JSON.stringify(FAKE_SETTINGS));

  // ── 初始化 mock 資料（首次才寫入預設）────────────────────
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TASKS));
  }

  // ── Patch GitHubAPI 同步執行（在 App.init DOMContentLoaded 之前套上）──
  GitHubAPI.getJSON = async function (_pat, _repo, path) {
    console.log('[Mock] getJSON', path);
    const raw = localStorage.getItem(STORAGE_KEY);
    const tasks = raw ? JSON.parse(raw) : [];
    return { content: tasks, sha: 'mock-sha-001' };
  };

  GitHubAPI.saveJSON = async function (_pat, _repo, path, data, _sha, _msg) {
    console.log('[Mock] saveJSON', path, data.length, 'tasks');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { sha: 'mock-sha-' + Date.now() };
  };

  // Patch getRaw — used by journal viewer & upload (sha check)
  GitHubAPI.getRaw = async function (_pat, _repo, path) {
    console.log('[Mock] getRaw', path);
    const journalKey = 'mock_journal_' + path.replace(/\//g, '_');
    const content = localStorage.getItem(journalKey);
    if (!content) throw new Error('404 Not Found (mock)');
    return { content, sha: 'mock-raw-sha-001' };
  };

  // Patch putRaw — used by journal upload
  GitHubAPI.putRaw = async function (_pat, _repo, path, content, _sha, _msg) {
    console.log('[Mock] putRaw', path);
    const journalKey = 'mock_journal_' + path.replace(/\//g, '_');
    localStorage.setItem(journalKey, content);
    return { sha: 'mock-raw-sha-' + Date.now() };
  };

  // Patch listDir — used by review journal list
  GitHubAPI.listDir = async function (_pat, _repo, _path) {
    console.log('[Mock] listDir', _path);
    const today = STORAGE_KEY ? new Date().toISOString().slice(0, 10) : '';
    const journalKey = 'mock_journal_taskflow_journal_' + today + '.md';
    const files = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mock_journal_taskflow_journal_')) {
        const name = k.replace('mock_journal_taskflow_journal_', '');
        files.push({ name, path: 'taskflow/journal/' + name });
      }
    }
    return files;
  };

  console.log('[Mock] GitHubAPI patched — mock mode active');

  // ── DOM 操作等 body ready ────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    // 標題加 (測試)
    document.title = document.title + ' (測試)';

    // Mock 標記 banner
    const indicator = document.createElement('div');
    indicator.id = 'mock-banner';
    indicator.textContent = '🧪 本機預覽 Mock 模式';
    indicator.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
      'background:#1f2937', 'color:#fbbf24', 'font-size:11px', 'font-weight:700',
      'padding:4px 12px', 'border-radius:999px', 'z-index:9999',
      'pointer-events:none', 'letter-spacing:.5px', 'opacity:.85'
    ].join(';');
    document.body.appendChild(indicator);
  });
})();
