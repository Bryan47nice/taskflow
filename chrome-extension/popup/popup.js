const DEFAULT_MENTIONS = ['@all'];

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('mentions');
  const status = document.getElementById('status');

  chrome.storage.local.get(['watchedMentions'], (result) => {
    const mentions = result.watchedMentions || DEFAULT_MENTIONS;
    textarea.value = mentions.join('\n');
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const mentions = textarea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    chrome.storage.local.set({ watchedMentions: mentions.length ? mentions : DEFAULT_MENTIONS }, () => {
      status.textContent = '已儲存 ✓';
      setTimeout(() => { status.textContent = ''; }, 2000);
    });
  });
});
