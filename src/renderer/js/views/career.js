// Career: Ausbildung / job applications as a compact list (inline status, quick add, filters), weekly goal,
// follow-up reminders, Bewerbung documents and Grok helpers for the Anschreiben, follow-ups and interview prep.
import { state, update } from '../state.js';
import { h, icon, uid, card, empty } from '../ui.js';
import { t } from '../i18n.js';
import { formModal } from '../modal.js';
import { today, prettyDate, addDays } from '../dates.js';
import { APP_STATUSES, careerStats } from '../planner-calc.js';
import { docTitle } from '../labels.js';
import { go } from '../app.js';

const KINDS = ['ausbildung', 'job', 'werkstudent', 'minijob', 'praktikum'];
const kinds = () => KINDS.map((k) => [k, t(`career.kind.${k}`)]);
const kindLabel = (k) => (KINDS.includes(k) ? t(`career.kind.${k}`) : k);
const statuses = () => APP_STATUSES.map(([k]) => [k, t(`status.${k}`)]);

const LINKS = [
  ['Jobbörse Arbeitsagentur', 'https://www.arbeitsagentur.de/jobsuche/'],
  ['AZUBIYO', 'https://www.azubiyo.de/'],
  ['ausbildung.de', 'https://www.ausbildung.de/'],
  ['Indeed', 'https://de.indeed.com/'],
  ['StepStone', 'https://www.stepstone.de/'],
  ['Make it in Germany', 'https://www.make-it-in-germany.com/'],
];

/** Moving to «sent» stamps the date and sets a follow-up in a week. */
function withStatus(app, status) {
  const out = { ...app, status };
  if (status !== 'wish' && !out.sentAt) out.sentAt = today();
  if (status === 'sent' && !out.followUp) out.followUp = addDays(out.sentAt || today(), 7);
  if (status === 'offer' || status === 'rejected') out.followUp = '';
  return out;
}

function appModal(a) {
  const isNew = !a?.id;
  formModal(
    isNew ? t('career.newApp') : `${a.company} — ${a.position}`,
    [
      { key: 'company', label: t('career.company'), required: true, half: true },
      { key: 'position', label: t('career.position'), required: true, half: true },
      { key: 'kind', label: t('common.type'), type: 'select', options: kinds(), half: true },
      { key: 'status', label: t('common.status'), type: 'select', options: statuses(), half: true },
      { key: 'city', label: t('career.city'), half: true },
      { key: 'start', label: t('career.start'), placeholder: t('career.startPh'), half: true },
      { key: 'sentAt', label: t('career.sentAt'), type: 'date', half: true },
      { key: 'followUp', label: t('career.followUp'), type: 'date', half: true },
      { key: 'link', label: t('career.link') },
      { key: 'contact', label: t('career.contact') },
      { key: 'note', label: t('career.note'), type: 'textarea', rows: 4 },
    ],
    { company: '', position: '', kind: 'ausbildung', status: 'wish', city: '', start: '', sentAt: '', followUp: '', link: '', contact: '', note: '', ...a },
    {
      onSave: (v) => {
        update((d) => {
          const apps = d.career.applications;
          const i = apps.findIndex((x) => x.id === a?.id);
          const rec = withStatus({ ...(i >= 0 ? apps[i] : { id: uid(), createdAt: today() }), ...v }, v.status);
          if (i >= 0) apps[i] = rec;
          else apps.push(rec);
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.career.applications = d.career.applications.filter((x) => x.id !== a.id))),
    },
  );
}

function setStatus(a, status) {
  update((d) => {
    const i = d.career.applications.findIndex((x) => x.id === a.id);
    d.career.applications[i] = withStatus(d.career.applications[i], status);
  });
}

export function anschreibenPrompt(a) {
  return t('prompt.anschreiben', {
    what: a.kind === 'job' ? t('prompt.vacancy') : kindLabel(a.kind),
    position: a.position,
    company: a.company,
    city: a.city ? ` (${a.city})` : '',
    note: a.note ? `${t('prompt.vacancyNote', { note: a.note })}\n` : '',
  });
}

function interviewPrompt(a) {
  return t('prompt.interview', { kind: kindLabel(a.kind), position: a.position, company: a.company });
}

function followUpPrompt(a) {
  return t('prompt.followUp', { company: a.company, position: a.position, when: a.sentAt ? prettyDate(a.sentAt) : t('prompt.recently') });
}

function goalModal() {
  formModal(t('career.weekGoal'), [{ key: 'weeklyGoal', label: t('career.weekGoalLabel'), type: 'number', required: true }], { weeklyGoal: state.data.career.weeklyGoal }, {
    onSave: (v) => {
      if (!(v.weeklyGoal > 0)) return false;
      update((d) => (d.career.weeklyGoal = Math.round(v.weeklyGoal)));
    },
  });
}

// ---- compact list ----

let filter = 'active';
let docsOpen = false;
const isDue = (a) => a.followUp && a.followUp <= today() && (a.status === 'sent' || a.status === 'interview');
const ORDER = { interview: 0, offer: 1, sent: 2, wish: 3, rejected: 4 };

/** Follow-ups that are due first, then by status, then the newest. */
function sortApps(list) {
  return [...list].sort(
    (a, b) => Number(isDue(b)) - Number(isDue(a)) || ORDER[a.status] - ORDER[b.status] || (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''),
  );
}

function quickAdd() {
  const company = h('input', { class: 'input', placeholder: t('career.company'), required: true, style: { flex: 1.2 } });
  const position = h('input', { class: 'input', placeholder: t('career.position'), required: true, style: { flex: 2 } });
  const kind = h('select', { class: 'input', style: { width: '140px' } }, kinds().map(([v, l]) => h('option', { value: v }, l)));
  const sent = h('select', { class: 'input', style: { width: '150px' } }, h('option', { value: 'wish' }, t('status.wish')), h('option', { value: 'sent' }, t('career.alreadySent')));
  return h(
    'form',
    {
      class: 'row quick-app',
      onsubmit: (e) => {
        e.preventDefault();
        if (!company.value.trim() || !position.value.trim()) return;
        update((d) =>
          d.career.applications.push(
            withStatus({ id: uid(), createdAt: today(), company: company.value.trim(), position: position.value.trim(), kind: kind.value, city: '', link: '', note: '' }, sent.value),
          ),
        );
        setTimeout(() => document.querySelector('.quick-app input')?.focus(), 0);
      },
    },
    company,
    position,
    kind,
    sent,
    h('button', { class: 'btn primary icon-only', type: 'submit', title: t('career.addHint') }, icon('plus', 16)),
  );
}

function appRow(a) {
  const due = isDue(a);
  const meta = [kindLabel(a.kind), a.city, a.status !== 'wish' && a.sentAt && t('career.sentShort', { date: prettyDate(a.sentAt) }), a.start && t('career.startShort', { start: a.start })].filter(Boolean);
  const grok =
    a.status === 'interview'
      ? h('button', { class: 'btn ghost sm', title: t('career.prepHint'), onclick: () => go('grok', { prompt: interviewPrompt(a) }) }, icon('spark', 13), t('career.prep'))
      : due
        ? h('button', { class: 'btn ghost sm', title: t('career.letterHint'), onclick: () => go('grok', { prompt: followUpPrompt(a) }) }, icon('spark', 13), t('career.letter'))
        : a.status === 'wish' || a.status === 'sent'
          ? h('button', { class: 'btn ghost sm', title: t('career.anschreibenHint'), onclick: () => go('grok', { prompt: anschreibenPrompt(a) }) }, icon('spark', 13), 'Anschreiben')
          : null;
  return h(
    'div',
    { class: `app-row status-${a.status}${due ? ' due' : ''}` },
    h(
      'select',
      { class: 'status-select', title: t('common.status'), onchange: (e) => setStatus(a, e.target.value) },
      statuses().map(([k, l]) => h('option', { value: k, selected: k === a.status ? 'selected' : null }, l)),
    ),
    h(
      'div',
      { class: 'grow', style: { cursor: 'pointer', minWidth: 0 }, onclick: () => appModal(a) },
      h('div', { class: 'title' }, h('b', {}, a.company), ' — ', a.position),
      h('div', { class: 'meta' }, due ? [t('career.writeAgain'), ...meta].join(' · ') : meta.join(' · ')),
    ),
    h('div', { class: 'app-actions' }, grok, a.link && h('a', { class: 'btn ghost sm icon-only', href: a.link, target: '_blank', title: t('career.vacancy') }, icon('up', 14))),
  );
}

function statsStrip(st, apps, weeklyGoal) {
  const share = Math.min(1, st.week / weeklyGoal);
  const item = (label, value) => h('div', { class: 'strip-item' }, h('div', { class: 'strip-value' }, value), h('div', { class: 'meta' }, label));
  return h(
    'div',
    { class: 'card career-strip' },
    h(
      'button',
      { class: 'strip-week', title: t('career.changeGoal'), onclick: goalModal },
      h('div', { class: 'meta' }, t('career.appsThisWeek')),
      h('div', { class: 'strip-value' }, `${st.week} / ${weeklyGoal}`),
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${share * 100}%` } })),
    ),
    item(t('career.stat.sent'), String(st.sent)),
    item(t('career.stat.reply'), st.sent ? `${Math.round(st.responseRate * 100)}%` : '—'),
    item(t('career.stat.interviews'), String(st.interviews)),
    item(t('career.stat.offers'), String(st.offers)),
    item(t('career.stat.planned'), String(apps.filter((a) => a.status === 'wish').length)),
  );
}

export function careerView() {
  const { applications, docs, weeklyGoal } = state.data.career;
  const st = careerStats(applications, today());
  const count = (k) => applications.filter((a) => a.status === k).length;
  const FILTERS = [['active', t('career.active'), applications.filter((a) => a.status !== 'rejected').length], ...statuses().map(([k, l]) => [k, l, count(k)]), ['all', t('common.all'), applications.length]];
  const shown = sortApps(filter === 'all' ? applications : filter === 'active' ? applications.filter((a) => a.status !== 'rejected') : applications.filter((a) => a.status === filter));
  const docsDone = docs.filter((x) => x.done).length;

  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head', style: { marginBottom: '14px' } }, h('div', {}, h('h1', {}, t('nav.career')), h('div', { class: 'sub' }, t('career.sub')))),
    statsStrip(st, applications, weeklyGoal),
    h(
      'div',
      { class: 'career-layout' },
      card(
        null,
        null,
        quickAdd(),
        h(
          'div',
          { class: 'filter-row' },
          FILTERS.filter(([k, , n]) => n > 0 || k === 'active' || k === filter).map(([k, l, n]) => h('button', { class: `chip${filter === k ? ' on' : ''}`, onclick: () => ((filter = k), update(() => {})) }, `${l} ${n}`)),
        ),
        shown.length ? h('div', { class: 'app-list' }, shown.map(appRow)) : empty(applications.length ? t('career.emptyFilter') : t('career.empty')),
      ),
      h(
        'div',
        { class: 'stack' },
        st.followUps.length > 0 &&
          card(
            t('career.followUpsTitle', { n: st.followUps.length }),
            null,
            h(
              'div',
              { class: 'list' },
              st.followUps.map((a) =>
                h(
                  'div',
                  { class: 'list-row' },
                  h('div', { class: 'grow', style: { cursor: 'pointer' }, onclick: () => appModal(a) }, h('div', { class: 'title' }, a.company), h('div', { class: 'meta' }, t('tasks.since', { date: prettyDate(a.followUp) }))),
                  h('button', { class: 'btn ghost sm', onclick: () => go('grok', { prompt: followUpPrompt(a) }) }, icon('spark', 13), t('career.letter')),
                ),
              ),
            ),
          ),
        card(
          t('career.docs'),
          h('button', { class: 'btn ghost sm', onclick: () => ((docsOpen = !docsOpen), update(() => {})) }, docsOpen ? t('common.collapse') : t('common.nOfM', { n: docsDone, m: docs.length })),
          h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${docs.length ? (docsDone / docs.length) * 100 : 0}%` } })),
          (docsOpen || docsDone < docs.length) &&
            h(
              'div',
              { class: 'list', style: { marginTop: '6px' } },
              docs
                .filter((doc) => docsOpen || !doc.done)
                .slice(0, docsOpen ? docs.length : 3)
                .map((doc) =>
                  h(
                    'div',
                    { class: `list-row compact${doc.done ? ' task-done' : ''}` },
                    h('button', { class: `check${doc.done ? ' on' : ''}`, onclick: () => update((d) => (d.career.docs.find((x) => x.id === doc.id).done = !doc.done)) }, doc.done && icon('check', 13)),
                    h('div', { class: 'grow title' }, docTitle(doc)),
                  ),
                ),
            ),
          !docsOpen && docsDone < docs.length - 3 && h('button', { class: 'btn ghost sm', onclick: () => ((docsOpen = true), update(() => {})) }, t('common.more', { n: docs.length - docsDone - 3 })),
        ),
        card(t('career.whereToLook'), null, h('div', { class: 'chips' }, LINKS.map(([name, url]) => h('a', { class: 'chip', href: url, target: '_blank', style: { textDecoration: 'none', color: 'inherit' } }, name)))),
      ),
    ),
  );
}
