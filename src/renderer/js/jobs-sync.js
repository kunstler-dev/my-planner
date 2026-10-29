// Daily check of the saved job searches (and the «Check now» button): new ads become applications «want to send»
// marked new; at most 20 per search and day, never an ad that was already seen or marked «not interested».
import { state, update } from './state.js';
import { t } from './i18n.js';
import { toast, uid } from './ui.js';
import { today } from './dates.js';
import { jobQuery, newJobs, jobToApplication } from './jobs-calc.js';

let running = false;
export const isJobsChecking = () => running;

export async function checkJobs({ silent = true } = {}) {
  const searches = state.data.jobs.searches;
  if (running || !searches.length) return;
  running = true;
  update(() => {});
  let added = 0;
  let error = '';
  try {
    for (const s of searches) {
      const res = await window.api.jobs.search(jobQuery(s));
      if (!res.ok) {
        error = res.error;
        continue;
      }
      const fresh = newJobs(res.jobs, { applications: state.data.career.applications, ignored: state.data.jobs.ignored });
      if (!fresh.length) continue;
      added += fresh.length;
      update((d) => d.career.applications.push(...fresh.map((j) => jobToApplication(j, s, today(), uid))), { silent: true });
    }
    update((d) => (d.jobs = { ...d.jobs, lastRun: today(), error, found: added ? { date: today(), n: added } : d.jobs.found }));
    if (!silent) toast(error && !added ? t('jobs.failed') : t('jobs.found', { n: added }));
  } finally {
    running = false;
    update(() => {});
  }
}

/** «Not interested»: the application goes away and its ad never comes back. */
export function ignoreJob(app) {
  update((d) => {
    d.career.applications = d.career.applications.filter((a) => a.id !== app.id);
    if (app.refnr && !d.jobs.ignored.includes(app.refnr)) d.jobs.ignored.push(app.refnr);
    d.jobs.ignored = d.jobs.ignored.slice(-2000);
  });
}
