// Job searches at the Bundesagentur für Arbeit (pure, unit-tested): query parameters for a saved search, new
// results without repeats (by refnr) and the application created from a job ad.

// angebotsart: 1 = Arbeit, 4 = Ausbildung / Duales Studium (jobsuche API v6). Werkstudent has no own type: a job
// search with the word in the query.
const TYPES = { ausbildung: 4, job: 1, werkstudent: 1 };
export const JOB_TYPES = Object.keys(TYPES);
export const MAX_NEW_PER_SEARCH = 20;

/** Saved search { was, wo, umkreis, type } → query parameters (new ads of the last 7 days, newest first page). */
export function jobQuery(search) {
  const was = String(search.was || '').trim();
  return {
    was: search.type === 'werkstudent' && !/werkstudent/i.test(was) ? `Werkstudent ${was}`.trim() : was,
    wo: String(search.wo || '').trim(),
    umkreis: Math.min(200, Math.max(0, Math.round(Number(search.umkreis) || 25))),
    angebotsart: TYPES[search.type] || 4,
    veroeffentlichtseit: 7,
    page: 1,
    size: 50,
  };
}

/** Public page of a job ad. */
export const jobLink = (refnr) => `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`;

/** Ads that are neither applications yet nor marked «not interested», at most 20 per search. */
export function newJobs(jobs, { applications = [], ignored = [] }, max = MAX_NEW_PER_SEARCH) {
  const known = new Set([...applications.map((a) => a.refnr).filter(Boolean), ...ignored]);
  const out = [];
  for (const j of jobs || []) {
    if (!j?.refnr || known.has(j.refnr)) continue;
    known.add(j.refnr);
    out.push(j);
    if (out.length >= max) break;
  }
  return out;
}

/** Job ad → application «want to send», marked new. */
export function jobToApplication(job, search, today, makeId) {
  return {
    id: makeId(),
    createdAt: today,
    company: job.company || '',
    position: job.title || job.profession || '',
    kind: search.type === 'job' ? 'job' : search.type,
    city: job.city || '',
    status: 'wish',
    link: jobLink(job.refnr),
    refnr: job.refnr,
    published: job.published || '',
    start: job.start ? job.start.split('-').reverse().join('.') : '',
    note: '',
    isNew: true,
    source: 'jobs',
  };
}
