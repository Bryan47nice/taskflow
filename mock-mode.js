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

  // ── 樣本封存記錄（已入日誌的歷史完成單）────────────────────
  // 按年分片，key = mock_archive_<year>。含已歸屬 pl-mock-1 與未歸屬各數筆，
  // 以及跨年資料，讓規劃頁四組清單 / 進度 / 挑單器都能離線驗。
  const ARCHIVE_PREFIX = 'mock_archive_';
  const DEFAULT_ARCHIVES = {
    '2026': [
      { id: 'a_2026-05-12_0', title: '盤點 Chrome extension 上架需要的素材', planId: 'pl-mock-1',
        estimate: '1h', urgency: 'medium', completedAt: '2026-05-12T12:00:00.000Z', journalDate: '2026-05-12' },
      { id: 'a_2026-05-20_0', title: '寫 manifest v3 權限說明', planId: 'pl-mock-1',
        estimate: '30m', urgency: 'low', completedAt: '2026-05-20T12:00:00.000Z', journalDate: '2026-05-20' },
      { id: 'a_2026-06-03_1', title: '產出 1280x800 商店主視覺', planId: 'pl-mock-1',
        estimate: '2h', urgency: 'high', completedAt: '2026-06-03T12:00:00.000Z', journalDate: '2026-06-03' },
      { id: 'a_2026-06-18_0', title: '修週覆盤日期互鎖', planId: null,
        estimate: '1h', urgency: 'medium', completedAt: '2026-06-18T12:00:00.000Z', journalDate: '2026-06-18' },
      { id: 'a_2026-07-09_0', title: '調整看板逾期警示配色', planId: null,
        estimate: '30m', urgency: 'low', completedAt: '2026-07-09T12:00:00.000Z', journalDate: '2026-07-09' },
      { id: 'a_2026-07-23_0', title: 'PDCA 四欄高度改為每張卡各自記憶', planId: null,
        estimate: '2h', urgency: 'medium', completedAt: '2026-07-23T12:00:00.000Z', journalDate: '2026-07-23' }
    ],
    '2025': [
      { id: 'a_2025-11-14_0', title: '（去年）TaskFlow 初版看板雛形', planId: null,
        estimate: '4h+', urgency: 'medium', completedAt: '2025-11-14T12:00:00.000Z', journalDate: '2025-11-14' }
    ]
  };
  Object.entries(DEFAULT_ARCHIVES).forEach(([year, list]) => {
    if (!localStorage.getItem(ARCHIVE_PREFIX + year)) {
      localStorage.setItem(ARCHIVE_PREFIX + year, JSON.stringify(list));
    }
  });

  // 對應的假日誌，讓歷史列「展開日誌全文」有東西可看。
  // 刻意只給部分日期，另一部分留白以便同時驗到「載入失敗」的路徑。
  const SAMPLE_JOURNALS = {
    '2026-06-03': [
      '# 2026-06-03 工作日誌', '',
      '## 今日完成',
      '- [x] 產出 1280x800 商店主視覺 (2h)',
      '- [x] 順手修掉 favicon 破圖 (15m)', '',
      '## PDCA 覆盤', '',
      '### 產出 1280x800 商店主視覺',
      '**Plan**：先照 Chrome Web Store 規格出主視覺，再補 440x280 小圖',
      '**Do**：用看板實際截圖去背，疊上標題與一句話賣點',
      '**Check**：上傳測試通過，但小圖文字在縮圖下讀不清',
      '**Act**：小圖只留 logo 與產品名，字級放大兩級', '',
      '## 明日計畫',
      '- [ ] 撰寫隱私權政策頁', '',
      '## 備注',
      '商店素材規格文件要存進 repo，下次改版不用再查。'
    ].join('\n'),
    '2026-07-23': [
      '# 2026-07-23 工作日誌', '',
      '## 今日完成',
      '- [x] PDCA 四欄高度改為每張卡各自記憶 (2h)', '',
      '## PDCA 覆盤', '',
      '### PDCA 四欄高度改為每張卡各自記憶',
      '**Plan**：四個 textarea 是跨任務共用的同一組 DOM，拖高 A 卡會殘留到 B 卡',
      '**Do**：各欄高度存進任務自身的 pdcaHeights 欄位，開卡時各自還原',
      '**Check**：A/B 兩卡互切驗證高度不再互相干擾',
      '**Act**：舊資料沒有 pdcaHeights 就回預設，向前相容', '',
      '## 明日計畫',
      '- [ ] 長期規劃與看板的結合方式想一下', '',
      '## 備注',
      '共用 DOM 的元件要特別小心殘留的 inline style。'
    ].join('\n')
  };
  Object.entries(SAMPLE_JOURNALS).forEach(([date, md]) => {
    const key = 'mock_journal_taskflow_journal_' + date + '.md';
    if (!localStorage.getItem(key)) localStorage.setItem(key, md);
  });

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
  // 依 path 分流：plans.json → mock_plans；archive/YYYY.json → mock_archive_YYYY；其餘 → mock_tasks
  const archiveYearOf = path => (path.match(/archive\/(\d{4})\.json$/) || [])[1] || null;

  GitHubAPI.getJSON = async function (_pat, _repo, path) {
    console.log('[Mock] getJSON', path);
    const year = archiveYearOf(path);
    if (year) {
      const raw = localStorage.getItem(ARCHIVE_PREFIX + year);
      return { content: raw ? JSON.parse(raw) : [], sha: 'mock-sha-arch-' + year };
    }
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
    const year = archiveYearOf(path);
    if (year) { localStorage.setItem(ARCHIVE_PREFIX + year, content); return 'mock-sha-arch-' + Date.now(); }
    if (path.includes('plans.json')) { localStorage.setItem(PLANS_KEY, content); return 'mock-sha-plans-' + Date.now(); }
    if (path.includes('tasks.json')) { localStorage.setItem(STORAGE_KEY, content); return 'mock-sha-' + Date.now(); }
    const journalKey = 'mock_journal_' + path.replace(/\//g, '_');
    localStorage.setItem(journalKey, content);
    return 'mock-raw-sha-' + Date.now();
  };

  // Patch listDir — 依 path 分流：archive 目錄回年檔、其餘回日誌檔
  GitHubAPI.listDir = async function (_pat, _repo, _path) {
    console.log('[Mock] listDir', _path);
    const files = [];
    if (String(_path).includes('archive')) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(ARCHIVE_PREFIX)) {
          const name = k.replace(ARCHIVE_PREFIX, '') + '.json';
          files.push({ name, path: 'taskflow/archive/' + name });
        }
      }
      return files;
    }
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
