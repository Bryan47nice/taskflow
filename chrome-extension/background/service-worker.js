// === TaskFlow Capture — service worker ===
// Change this to your actual deployed URL (or file:// path for local testing)
const APP_URL = 'https://Bryan47nice.github.io/My-Obsidian/index.html';

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-task') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  let result = null;
  try {
    const [{ result: r } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: grabSelection
    });
    result = r;
  } catch (_) {
    // Restricted page (chrome://, extensions store, etc.) — open TaskFlow without prefill
  }

  const params = new URLSearchParams({ triage: '1' });
  if (result?.text) params.set('text', result.text);
  if (result?.source) params.set('source', result.source);
  if (result?.url) params.set('url', result.url);

  chrome.tabs.create({ url: `${APP_URL}?${params}` });
});

// Runs in page context — must be self-contained, no closure references
function grabSelection() {
  const text = String(window.getSelection() || '').trim();
  if (!text) return null;

  const host = window.location.hostname;
  const detect = (h) => {
    if (h.includes('chat.google.com')) return 'gchat';
    if (h.includes('atlassian.net')) return 'jira';
    if (h.includes('mail.google.com')) return 'gmail';
    if (h.includes('notion.so')) return 'notion';
    if (h.includes('slack.com')) return 'slack';
    return h.replace('www.', '').split('.')[0];
  };

  return {
    text: text.length > 400 ? text.slice(0, 400) + '…' : text,
    url: window.location.href,
    source: detect(host)
  };
}
