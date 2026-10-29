// Project timer: one at a time, kept in data.timer so it survives a restart. Stop writes the time into the
// project's hours (rounded to 0.05 h). The tray shows it and can start or stop it.
import { state, update } from './state.js';
import { t } from './i18n.js';
import { toast } from './ui.js';
import { today } from './dates.js';
import { timerHours, elapsedText } from './productivity-calc.js';

const projectOf = (id) => state.data.projects.find((p) => p.id === id);

export function stopTimer() {
  const tm = state.data.timer;
  if (!tm) return;
  const hours = timerHours(tm.startedAt, Date.now());
  update((d) => {
    const p = d.projects.find((x) => x.id === tm.projectId);
    if (p) (p.hours ||= []).push({ hours, date: today(), note: '' });
    d.timer = null;
    d.timerLast = tm.projectId;
  });
  const p = projectOf(tm.projectId);
  if (p) toast(t('timer.saved', { hours, name: p.name }));
  syncTray();
}

export function startTimer(projectId) {
  if (state.data.timer?.projectId === projectId) return;
  if (state.data.timer) stopTimer();
  update((d) => {
    d.timer = { projectId, startedAt: Date.now() };
    d.timerLast = projectId;
  });
  syncTray();
}

export const toggleTimer = (projectId) => (state.data.timer?.projectId === projectId ? stopTimer() : startTimer(projectId));

/** Tray tooltip and menu items: «Stop: project (1:23)» or «Start: last project». */
export function syncTray() {
  const tm = state.data.timer;
  const running = tm && projectOf(tm.projectId);
  const last = !tm && projectOf(state.data.timerLast);
  window.api.setTimer(running ? { title: running.name, elapsed: elapsedText(Date.now() - tm.startedAt) } : last ? { lastTitle: last.name } : null);
}

/** Running clocks on screen (elements with data-timer-start) without re-rendering the page. */
export function tickTimerDom() {
  for (const el of document.querySelectorAll('[data-timer-start]')) el.textContent = elapsedText(Date.now() - Number(el.dataset.timerStart));
}
