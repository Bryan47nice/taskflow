// === Claude API — title suggestion ===
const ClaudeAPI = {
  async suggestTitle(apiKey, text, source) {
    const sourceLabel = {
      gchat: 'Google Chat',
      jira: 'Jira',
      gmail: 'Gmail',
      slack: 'Slack',
      notion: 'Notion'
    }[source] || source || '網頁';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64,
        messages: [{
          role: 'user',
          content: `來源：${sourceLabel}\n內容：${text.slice(0, 500)}\n\n請用 15 字以內的繁體中文，為這段內容取一個任務標題。只回傳標題文字，不要加引號或其他說明。`
        }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Claude API ${res.status}: ${err.error?.message || ''}`);
    }

    const data = await res.json();
    return (data.content?.[0]?.text || '').trim();
  }
};
