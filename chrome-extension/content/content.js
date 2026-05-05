// === TaskFlow Capture — Google Chat content script ===

const PROCESSED_ATTR = 'data-tf-processed';
const HASH_ATTR      = 'data-tf-hash';
let watchedMentions  = ['@all'];

// Map<hash, btnElement> — lets us update already-injected buttons when storage changes
const btnMap = new Map();

console.log('[TaskFlow] Content script 已載入，URL:', window.location.href);

chrome.storage.local.get(['watchedMentions'], (result) => {
  if (result.watchedMentions?.length) watchedMentions = result.watchedMentions;
  console.log('[TaskFlow] 監看 mentions:', watchedMentions);
  init();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.watchedMentions) {
    watchedMentions = changes.watchedMentions.newValue || ['@all'];
  }
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith('tf_task_')) continue;
    const hash = key.slice('tf_task_'.length);
    const btn  = btnMap.get(hash);
    if (btn) renderBtn(btn, change.newValue?.status || 'idle');
  }
});

// ── Hash ──────────────────────────────────────────────────────────────────────
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function msgHash(text, url) {
  return simpleHash(url + '|' + text.slice(0, 120));
}

// ── Text helpers ──────────────────────────────────────────────────────────────
function normText(el) {
  return (el.innerText || el.textContent || '').replace(/@\s+/g, '@');
}

function hasMention(container) {
  // Exclude our own injected button text from the check
  const clone = container.cloneNode(true);
  clone.querySelectorAll('.tf-capture-wrapper').forEach(el => el.remove());
  const text = normText(clone).toLowerCase();
  return watchedMentions.some(m => text.includes(m.toLowerCase()));
}

function grabMessageText(container) {
  // Clone and strip injected buttons so they never leak into task content
  const clone = container.cloneNode(true);
  clone.querySelectorAll('.tf-capture-wrapper').forEach(el => el.remove());
  const text = (clone.innerText || clone.textContent || '').trim();
  return text.length > 400 ? text.slice(0, 400) + '…' : text;
}

// ── Button rendering ──────────────────────────────────────────────────────────
const STATE_MAP = {
  idle:          { text: '➕ 加入 TaskFlow', cls: '' },
  loading:       { text: '⏳ 新增中…',       cls: 'tf-loading' },
  todo:          { text: '📋 待辦',           cls: 'tf-todo' },
  'in-progress': { text: '⚡ 進行中',         cls: 'tf-inprogress' },
  done:          { text: '✅ 完成',            cls: 'tf-done' },
};

function renderBtn(btn, state) {
  const { text, cls } = STATE_MAP[state] || STATE_MAP.idle;
  btn.textContent = text;
  btn.className   = 'tf-capture-btn' + (cls ? ` ${cls}` : '');
  btn.disabled    = state !== 'idle';
}

// ── Injection guards ──────────────────────────────────────────────────────────
// Prevent double-injection when findMessageContainer returns different ancestors
// for the same message on different scan passes.

function hasProcessedAncestor(el) {
  let cur = el.parentElement;
  for (let i = 0; i < 10 && cur && cur !== document.body; i++) {
    if (cur.hasAttribute(PROCESSED_ATTR)) return true;
    cur = cur.parentElement;
  }
  return false;
}

function hasProcessedDescendant(el) {
  return !!el.querySelector(`[${PROCESSED_ATTR}]`);
}

// ── Inject button ─────────────────────────────────────────────────────────────
function injectButton(container) {
  if (container.hasAttribute(PROCESSED_ATTR)) return;
  if (hasProcessedAncestor(container)) return;    // parent already handled this message
  if (hasProcessedDescendant(container)) return;  // child already handled this message

  // Remove any orphaned wrapper left from a previous injection in this container
  container.querySelectorAll('.tf-capture-wrapper').forEach(el => el.remove());

  container.setAttribute(PROCESSED_ATTR, 'true');

  const text = grabMessageText(container);
  const hash = msgHash(text, window.location.href);
  container.setAttribute(HASH_ATTR, hash);

  const wrapper = document.createElement('div');
  wrapper.className = 'tf-capture-wrapper';

  const btn = document.createElement('button');
  btn.className = 'tf-capture-btn';

  chrome.storage.local.get([`tf_task_${hash}`], (result) => {
    const saved = result[`tf_task_${hash}`];
    renderBtn(btn, saved?.status || 'idle');
  });

  btn.addEventListener('click', () => {
    if (!chrome.runtime?.id) { btn.textContent = '❌ 請重新整理頁面'; return; }
    renderBtn(btn, 'loading');
    chrome.runtime.sendMessage({ type: 'OPEN_TRIAGE', text, url: window.location.href });
  });

  btnMap.set(hash, btn);
  wrapper.appendChild(btn);
  container.appendChild(wrapper);
}

// ── Find message container ────────────────────────────────────────────────────
function findMessageContainer(node) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  // Pass 1: semantic role
  let cur = el;
  for (let i = 0; i < 25 && cur && cur !== document.body; i++) {
    const role = cur.getAttribute?.('role') || '';
    const tag  = cur.tagName?.toLowerCase() || '';
    if (role === 'listitem' || role === 'row' || tag === 'article' || tag === 'li') return cur;
    cur = cur.parentElement;
  }

  // Pass 2: size heuristic
  cur = el;
  for (let i = 0; i < 25 && cur && cur !== document.body; i++) {
    const w = cur.offsetWidth, h = cur.offsetHeight;
    if (w > 100 && h > 20 && h < 800) return cur;
    cur = cur.parentElement;
  }
  return null;
}

// ── Scan ──────────────────────────────────────────────────────────────────────
function scanMessages(root) {
  const scope = root || document.body;
  const injected = new Set();

  // S1: role-based
  const selfRole = scope.getAttribute?.('role') || '';
  const selfTag  = scope.tagName?.toLowerCase() || '';
  const selfList = (selfRole === 'listitem' || selfRole === 'row' || selfTag === 'article' || selfTag === 'li') ? [scope] : [];
  const descList = Array.from(scope.querySelectorAll('[role="listitem"], [role="row"], article, li'));

  for (const c of [...selfList, ...descList]) {
    if (c.hasAttribute(PROCESSED_ATTR) || injected.has(c)) continue;
    if (hasProcessedAncestor(c) || hasProcessedDescendant(c)) continue;
    if (!hasMention(c)) continue;
    injected.add(c);
    injectButton(c);
  }

  // S2: TreeWalker for conversation view (@mention chips)
  const nameTerms = watchedMentions.map(m => m.replace(/^@/, '').toLowerCase()).filter(Boolean);
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text nodes inside our own injected buttons
      if (node.parentElement?.closest('.tf-capture-wrapper')) return NodeFilter.FILTER_SKIP;
      const t = (node.nodeValue || '').toLowerCase();
      return nameTerms.some(n => n && t.includes(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  const textNodes = [];
  let tn;
  while ((tn = walker.nextNode())) textNodes.push(tn);

  for (const textNode of textNodes) {
    const c = findMessageContainer(textNode);
    if (!c || c.hasAttribute(PROCESSED_ATTR) || injected.has(c)) continue;
    if (hasProcessedAncestor(c) || hasProcessedDescendant(c)) continue;
    if (!hasMention(c)) continue;
    injected.add(c);
    injectButton(c);
  }
}

// ── Observer & URL watcher ────────────────────────────────────────────────────
function startObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        // Skip our own injected elements
        if (node.classList?.contains('tf-capture-wrapper')) continue;
        const t = (node.innerText || node.textContent || '').toLowerCase();
        const nameTerms = watchedMentions.map(m => m.replace(/^@/, '').toLowerCase());
        if (!nameTerms.some(n => n && t.includes(n))) continue;
        setTimeout(() => scanMessages(node), 150);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

let lastUrl = location.href;
function watchUrlChange() {
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      btnMap.clear();
      // Remove all processed markers and injected wrappers
      document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => {
        el.removeAttribute(PROCESSED_ATTR);
        el.removeAttribute(HASH_ATTR);
      });
      document.querySelectorAll('.tf-capture-wrapper').forEach(el => el.remove());
      setTimeout(scanMessages, 1500);
    }
  }, 500);
}

function init() {
  console.log('[TaskFlow] 開始掃描...');
  // Clean up any orphaned wrappers from previous sessions
  document.querySelectorAll('.tf-capture-wrapper').forEach(el => el.remove());
  setTimeout(scanMessages, 800);
  startObserver();
  watchUrlChange();
}
