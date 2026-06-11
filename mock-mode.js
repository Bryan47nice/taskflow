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
      status: 'todo',
      done: false,
      source: null,
      pdca: { plan: '列出昨日進度與今日計畫', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(),
      completedAt: null,
      dayKey: today
    },
    // ── 長期規劃「上架 Chrome Web Store」的子單（planId: pl-mock-1）──
    {
      id: 'mock-6', title: '準備商店截圖素材', body: '', links: [],
      urgency: 'medium', estimate: '1h', deadline: 'backlog',
      status: 'planned', done: false, source: null,
      pdca: { plan: '', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(), completedAt: null, dayKey: today,
      actualMinutes: 0, planId: 'pl-mock-1'
    },
    {
      id: 'mock-7', title: '撰寫隱私權政策頁', body: '', links: [],
      urgency: 'high', estimate: '2h', deadline: 'backlog',
      status: 'planned', done: false, source: null,
      pdca: { plan: '', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(), completedAt: null, dayKey: today,
      actualMinutes: 0, planId: 'pl-mock-1'
    },
    {
      id: 'mock-8', title: '研究商店審核規則', body: '', links: [],
      urgency: 'low', estimate: '30m', deadline: 'today',
      status: 'done', done: true, source: null,
      pdca: { plan: '', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), dayKey: today,
      actualMinutes: 0, planId: 'pl-mock-1'
    }
  ];

  // ── 樣本長期規劃（母單）────────────────────────────────────
  const PLANS_KEY = 'mock_plans';
  const DEFAULT_PLANS = [
    {
      id: 'pl-mock-1',
      title: '上架 Chrome Web Store',
      why: '把 TaskFlow Capture 擴充功能正式上架，讓更多人能一鍵擷取任務。\n需完成商店素材、隱私權政策與通過審核。',
      status: 'active',
      targetPeriod: '2026-Q3',
      order: null,
      createdAt: new Date().toISOString(),
      completedAt: null
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
  if (!localStorage.getItem(PLANS_KEY)) {
    localStorage.setItem(PLANS_KEY, JSON.stringify(DEFAULT_PLANS));
  }

  // ── Patch GitHubAPI 同步執行（在 App.init DOMContentLoaded 之前套上）──
  // 依 path 分流：plans.json → mock_plans；其餘 → mock_tasks
  GitHubAPI.getJSON = async function (_pat, _repo, path) {
    console.log('[Mock] getJSON', path);
    const key = path.includes('plans.json') ? PLANS_KEY : STORAGE_KEY;
    const sha = path.includes('plans.json') ? 'mock-sha-plans' : 'mock-sha-001';
    const raw = localStorage.getItem(key);
    return { content: raw ? JSON.parse(raw) : [], sha };
  };

  GitHubAPI.saveJSON = async function (_pat, _repo, path, data, _sha, _msg) {
    console.log('[Mock] saveJSON', path, Array.isArray(data) ? data.length : 0, 'items');
    const key = path.includes('plans.json') ? PLANS_KEY : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(data));
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

  // Patch putRaw — tasks.json/plans.json 寫回各自 key（reload 後可還原）；其餘走 journal
  GitHubAPI.putRaw = async function (_pat, _repo, path, content, _sha, _msg) {
    console.log('[Mock] putRaw', path);
    if (path.includes('plans.json')) { localStorage.setItem(PLANS_KEY, content); return 'mock-sha-plans-' + Date.now(); }
    if (path.includes('tasks.json')) { localStorage.setItem(STORAGE_KEY, content); return 'mock-sha-' + Date.now(); }
    const journalKey = 'mock_journal_' + path.replace(/\//g, '_');
    localStorage.setItem(journalKey, content);
    return 'mock-raw-sha-' + Date.now();
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
