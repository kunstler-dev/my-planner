// Shared background scheduler: tasks register with an interval, the last run is kept in data.sync, everything is
// checked once a minute. A date change while the app is open (midnight) runs the day handlers.
import { state, update } from './state.js';
import { isDue, MINUTE } from './notify-calc.js';
import { today } from './dates.js';

const tasks = new Map();
const dayHandlers = [];
const running = new Set();
let day = '';
let timer = 0;

/** fn may be async; a failure is logged and the task simply runs again after its interval. */
export function register(id, interval, fn) {
  tasks.set(id, { interval, fn });
}

export function onDayChange(fn) {
  dayHandlers.push(fn);
}

export async function tick(now = Date.now()) {
  const d = today();
  if (d !== day) {
    day = d;
    for (const fn of dayHandlers) {
      try {
        fn(d);
      } catch (err) {
        console.warn('day handler failed', err);
      }
    }
  }
  for (const [id, task] of tasks) {
    if (running.has(id) || !isDue(state.data.sync[id], task.interval, now)) continue;
    running.add(id);
    update((data) => (data.sync[id] = now), { silent: true });
    try {
      await task.fn();
    } catch (err) {
      console.warn('background task failed', id, err);
    } finally {
      running.delete(id);
    }
  }
}

export function startScheduler() {
  clearInterval(timer);
  tick();
  timer = setInterval(() => tick(), MINUTE);
}
