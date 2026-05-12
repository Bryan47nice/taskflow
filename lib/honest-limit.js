// === Honest Limit Engine (Time-based + Weighted Discount) ===
const HonestLimit = {

  ESTIMATE_MINUTES: { '15m': 15, '30m': 30, '1h': 60, '2h': 120, '2h+': 120, '3h': 180, '4h+': 240 },

  toMinutes(estimate) {
    if (this.ESTIMATE_MINUTES[estimate]) return this.ESTIMATE_MINUTES[estimate];
    const match = String(estimate).match(/^(\d+)min$/) || String(estimate).match(/^(\d+)m$/);
    if (match) return parseInt(match[1]);
    return 30;
  },

  formatTime(minutes) {
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}hr ${m}min` : `${h}hr`;
    }
    return `${minutes}min`;
  },

  // Weighted discount from 3 most recent days. Most recent ×3, middle ×2, oldest ×1.
  calculateDiscount(stats) {
    if (stats.forecastEnabled === false) return 1.0;
    const days = stats.days || [];
    if (days.length < 3) return 1.0;
    const recent = days.slice(-3);
    let weightedSum = 0, weightTotal = 0;
    recent.forEach((d, i) => {
      if (d.estimatedMinutes <= 0) return;
      const ratio = d.completedMinutes / d.estimatedMinutes;
      const dist = recent.length - 1 - i;
      const weight = dist === 0 ? 3 : dist === 1 ? 2 : 1;
      weightedSum += ratio * weight;
      weightTotal += weight;
    });
    if (weightTotal === 0) return 0.7;
    return Math.max(0.3, Math.min(1.0, weightedSum / weightTotal));
  },

  calculateAvailable(tasks, stats) {
    const dailyHours = stats.dailyHours || 8;
    const meetingMinutes = tasks
      .filter(t => t.type === 'meeting')
      .reduce((sum, t) => sum + this.toMinutes(t.estimate), 0);
    const freeMinutes = dailyHours * 60 - meetingMinutes;
    return Math.max(0, Math.round(freeMinutes * this.calculateDiscount(stats)));
  },

  completedMinutesToday(tasks, today) {
    return tasks
      .filter(t => t.status === 'done' && t.dayKey === today && t.type !== 'meeting')
      .reduce((sum, t) => sum + this.toMinutes(t.estimate), 0);
  },

  scheduledMinutesToday(tasks) {
    return tasks
      .filter(t => t.status === 'in-progress' && t.type !== 'meeting')
      .reduce((sum, t) => sum + this.toMinutes(t.estimate), 0);
  },

  getMessage(completedMin, availableMin, scheduledMin) {
    const usedMin = completedMin + scheduledMin;
    const usedStr = this.formatTime(usedMin);
    const availableStr = this.formatTime(availableMin);
    if (usedMin === 0) return `可用 ${availableStr}，開始排任務吧`;
    if (usedMin > availableMin) {
      const over = this.formatTime(usedMin - availableMin);
      return `已排 ${usedStr} / 可用 ${availableStr}（超出 ${over}）`;
    }
    if (completedMin >= availableMin) return `已排 ${usedStr} / 可用 ${availableStr} 達標`;
    return `已排 ${usedStr} / 可用 ${availableStr}`;
  }
};
