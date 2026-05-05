// === TaskFlow Bridge — content script on TaskFlow page ===
// Reads tasks from GitHub (using the same PAT stored in localStorage by the app),
// computes the same hash used by the Google Chat content script,
// and writes { tf_task_<hash>: { status, title } } into chrome.storage.local
// so the Google Chat buttons can reflect real task states.
// Also removes stale entries (button clicked but triage was abandoned).

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// Strip injected button text that may have leaked into snippet due to a previous bug.
function cleanSnippet(snippet) {
  return snippet
    .replace(/[➕📋⚡✅⏳][^\n]*加入\s*TaskFlow[^\n]*/gi, '')
    .replace(/\+\s*加入\s*TaskFlow[^\n]*/gi, '')
    .trim();
}

// Must match msgHash() in content.js: hash(chatUrl + '|' + text.slice(0, 120))
function taskHash(sourceUrl, snippet) {
  return simpleHash(sourceUrl + '|' + cleanSnippet(snippet).slice(0, 120));
}

async function syncTasks() {
  try {
    const raw = localStorage.getItem('taskflow_settings');
    if (!raw) return;
    const { pat, repo } = JSON.parse(raw);
    if (!pat || !repo) return;

    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/taskflow/tasks.json`,
      { headers: { Authorization: `token ${pat}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (!res.ok) return;

    const { content } = await res.json();
    const tasks = JSON.parse(atob(content.replace(/\n/g, '')));

    // Build map of valid hashes → status
    const updates = {};
    for (const task of tasks) {
      if (!task.source?.url || !task.source?.snippet) continue;
      const hash = taskHash(task.source.url, task.source.snippet);
      updates[`tf_task_${hash}`] = { status: task.status, title: task.title };
    }

    // Clean up stale entries: tf_task_* keys in storage that have no matching GitHub task.
    // This handles the case where a button was clicked but triage was abandoned.
    const allStorage = await new Promise(resolve => chrome.storage.local.get(null, resolve));
    const staleKeys = Object.keys(allStorage).filter(k =>
      k.startsWith('tf_task_') && !updates[k]
    );
    if (staleKeys.length > 0) {
      chrome.storage.local.remove(staleKeys);
      console.log('[TaskFlow Bridge] 清除殘留狀態:', staleKeys.length, '筆');
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
    console.log('[TaskFlow Bridge] 同步完成，有效任務:', Object.keys(updates).length, '筆');
  } catch (e) {
    console.log('[TaskFlow Bridge] 同步失敗:', e.message);
  }
}

// Sync on load, then every 30s
syncTasks();
setInterval(syncTasks, 30_000);
