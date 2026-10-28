// Career: Ausbildung / job applications as a compact list (inline status, quick add, filters), weekly goal,
// follow-up reminders, Bewerbung documents and Grok helpers for the Anschreiben, follow-ups and interview prep.
import { state, update } from '../state.js';
import { h, icon, uid, card, empty } from '../ui.js';
import { formModal } from '../modal.js';
import { today, prettyDate, addDays } from '../dates.js';
import { APP_STATUSES, careerStats } from '../planner-calc.js';
import { go } from '../app.js';

const KINDS = [
  ['ausbildung', 'Ausbildung'],
  ['job', 'Работа'],
  ['werkstudent', 'Werkstudent'],
  ['minijob', 'Minijob'],
  ['praktikum', 'Praktikum'],
];
const kindLabel = (k) => KINDS.find(([v]) => v === k)?.[1] || k;

const LINKS = [
  ['Jobbörse Arbeitsagentur', 'https://www.arbeitsagentur.de/jobsuche/'],
  ['AZUBIYO', 'https://www.azubiyo.de/'],
  ['ausbildung.de', 'https://www.ausbildung.de/'],
  ['Indeed', 'https://de.indeed.com/'],
  ['StepStone', 'https://www.stepstone.de/'],
  ['Make it in Germany', 'https://www.make-it-in-germany.com/'],
];

/** Moving to «Отправлено» stamps the date and sets a follow-up in a week. */
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
    isNew ? 'Новый отклик' : `${a.company} — ${a.position}`,
    [
      { key: 'company', label: 'Компания', required: true, half: true },
      { key: 'position', label: 'Профессия / должность', required: true, half: true },
      { key: 'kind', label: 'Тип', type: 'select', options: KINDS, half: true },
      { key: 'status', label: 'Статус', type: 'select', options: APP_STATUSES, half: true },
      { key: 'city', label: 'Город', half: true },
      { key: 'start', label: 'Начало (для Ausbildung)', placeholder: 'например, 01.08.2027', half: true },
      { key: 'sentAt', label: 'Дата отправки', type: 'date', half: true },
      { key: 'followUp', label: 'Напомнить написать', type: 'date', half: true },
      { key: 'link', label: 'Ссылка на вакансию' },
      { key: 'contact', label: 'Контакт (имя, почта, телефон)' },
      { key: 'note', label: 'Заметки: требования, что спросить, что ответили', type: 'textarea', rows: 4 },
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
  return (
    `Помоги написать Anschreiben на немецком для ${kindLabel(a.kind) === 'Работа' ? 'вакансии' : kindLabel(a.kind)} «${a.position}» в компании ${a.company}${a.city ? ` (${a.city})` : ''}.\n` +
    `${a.note ? `Что известно о вакансии: ${a.note}\n` : ''}` +
    'Обо мне: (дополни сам — возраст, язык B1/B2, школа/опыт, почему эта профессия). ' +
    'Сделай Anschreiben на 1 страницу по DIN 5008, без шаблонных фраз, и отдельно 3 совета, что подчеркнуть именно для этой компании. Потом спроси, чего не хватает.'
  );
}

function interviewPrompt(a) {
  return (
    `У меня Vorstellungsgespräch на ${kindLabel(a.kind)} «${a.position}» в ${a.company}. ` +
    'Дай 12 самых вероятных вопросов на немецком с короткими примерами ответов (уровень B1–B2), 5 вопросов, которые стоит задать мне, и что надеть/принести. ' +
    'Потом устроим тренировку: задавай вопросы по одному и поправляй мой немецкий.'
  );
}

function followUpPrompt(a) {
  return `Напиши короткое вежливое письмо на немецком в ${a.company}: я отправил заявку на «${a.position}» ${a.sentAt ? prettyDate(a.sentAt) : 'недавно'} и хочу узнать о статусе. Без навязчивости, 4–5 предложений.`;
}

function goalModal() {
  formModal('Цель на неделю', [{ key: 'weeklyGoal', label: 'Сколько откликов отправлять в неделю', type: 'number', required: true }], { weeklyGoal: state.data.career.weeklyGoal }, {
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
    (a, b) =>
      Number(isDue(b)) - Number(isDue(a)) ||
      ORDER[a.status] - ORDER[b.status] ||
      (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''),
  );
}

function quickAdd() {
  const company = h('input', { class: 'input', placeholder: 'Компания', required: true, style: { flex: 1.2 } });
  const position = h('input', { class: 'input', placeholder: 'Профессия / должность', required: true, style: { flex: 2 } });
  const kind = h('select', { class: 'input', style: { width: '140px' } }, KINDS.map(([v, l]) => h('option', { value: v }, l)));
  const sent = h('select', { class: 'input', style: { width: '150px' } }, h('option', { value: 'wish' }, 'Хочу отправить'), h('option', { value: 'sent' }, 'Уже отправил'));
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
    h('button', { class: 'btn primary icon-only', type: 'submit', title: 'Добавить (подробности — кликом по строке)' }, icon('plus', 16)),
  );
}

function appRow(a) {
  const due = isDue(a);
  const meta = [
    kindLabel(a.kind),
    a.city,
    a.status !== 'wish' && a.sentAt && `отпр. ${prettyDate(a.sentAt)}`,
    a.start && `старт ${a.start}`,
  ].filter(Boolean);
  const grok =
    a.status === 'interview'
      ? h('button', { class: 'btn ghost sm', title: 'Подготовка к собеседованию с Grok', onclick: () => go('grok', { prompt: interviewPrompt(a) }) }, icon('spark', 13), 'Подготовка')
      : due
        ? h('button', { class: 'btn ghost sm', title: 'Письмо о статусе заявки', onclick: () => go('grok', { prompt: followUpPrompt(a) }) }, icon('spark', 13), 'Письмо')
        : a.status === 'wish' || a.status === 'sent'
          ? h('button', { class: 'btn ghost sm', title: 'Anschreiben с Grok', onclick: () => go('grok', { prompt: anschreibenPrompt(a) }) }, icon('spark', 13), 'Anschreiben')
          : null;
  return h(
    'div',
    { class: `app-row status-${a.status}${due ? ' due' : ''}` },
    h(
      'select',
      { class: 'status-select', title: 'Статус', onchange: (e) => setStatus(a, e.target.value) },
      APP_STATUSES.map(([k, l]) => h('option', { value: k, selected: k === a.status ? 'selected' : null }, l)),
    ),
    h(
      'div',
      { class: 'grow', style: { cursor: 'pointer', minWidth: 0 }, onclick: () => appModal(a) },
      h('div', { class: 'title' }, h('b', {}, a.company), ' — ', a.position),
      h('div', { class: 'meta' }, due ? ['⏰ пора написать ещё раз', ...meta].join(' · ') : meta.join(' · ')),
    ),
    h('div', { class: 'app-actions' }, grok, a.link && h('a', { class: 'btn ghost sm icon-only', href: a.link, target: '_blank', title: 'Вакансия' }, icon('up', 14))),
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
      { class: 'strip-week', title: 'Изменить цель на неделю', onclick: goalModal },
      h('div', { class: 'meta' }, 'Откликов на неделе'),
      h('div', { class: 'strip-value' }, `${st.week} / ${weeklyGoal}`),
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${share * 100}%` } })),
    ),
    item('отправлено', String(st.sent)),
    item('отвечают', st.sent ? `${Math.round(st.responseRate * 100)}%` : '—'),
    item('собеседования', String(st.interviews)),
    item('офферы', String(st.offers)),
    item('в планах', String(apps.filter((a) => a.status === 'wish').length)),
  );
}

export function careerView() {
  const { applications, docs, weeklyGoal } = state.data.career;
  const st = careerStats(applications, today());
  const count = (k) => applications.filter((a) => a.status === k).length;
  const FILTERS = [['active', 'Активные', applications.filter((a) => a.status !== 'rejected').length], ...APP_STATUSES.map(([k, l]) => [k, l, count(k)]), ['all', 'Все', applications.length]];
  const shown = sortApps(filter === 'all' ? applications : filter === 'active' ? applications.filter((a) => a.status !== 'rejected') : applications.filter((a) => a.status === filter));
  const docsDone = docs.filter((x) => x.done).length;

  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head', style: { marginBottom: '14px' } }, h('div', {}, h('h1', {}, 'Карьера'), h('div', { class: 'sub' }, 'Ausbildung и работа в Германии'))),
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
          FILTERS.filter(([k, , n]) => n > 0 || k === 'active' || k === filter).map(([k, l, n]) =>
            h('button', { class: `chip${filter === k ? ' on' : ''}`, onclick: () => ((filter = k), update(() => {})) }, `${l} ${n}`),
          ),
        ),
        shown.length
          ? h('div', { class: 'app-list' }, shown.map(appRow))
          : empty(applications.length ? 'Здесь пусто' : 'Добавь первый отклик строкой выше: компания, профессия, тип. Подробности (город, ссылка, контакт) — кликом по строке.'),
      ),
      h(
        'div',
        { class: 'stack' },
        st.followUps.length > 0 &&
          card(
            `⏰ Написать повторно · ${st.followUps.length}`,
            null,
            h(
              'div',
              { class: 'list' },
              st.followUps.map((a) =>
                h(
                  'div',
                  { class: 'list-row' },
                  h('div', { class: 'grow', style: { cursor: 'pointer' }, onclick: () => appModal(a) }, h('div', { class: 'title' }, a.company), h('div', { class: 'meta' }, `с ${prettyDate(a.followUp)}`)),
                  h('button', { class: 'btn ghost sm', onclick: () => go('grok', { prompt: followUpPrompt(a) }) }, icon('spark', 13), 'Письмо'),
                ),
              ),
            ),
          ),
        card(
          'Документы',
          h('button', { class: 'btn ghost sm', onclick: () => ((docsOpen = !docsOpen), update(() => {})) }, docsOpen ? 'Свернуть' : `${docsDone} из ${docs.length}`),
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
                    h('div', { class: 'grow title' }, doc.title),
                  ),
                ),
            ),
          !docsOpen && docsDone < docs.length - 3 && h('button', { class: 'btn ghost sm', onclick: () => ((docsOpen = true), update(() => {})) }, `ещё ${docs.length - docsDone - 3}`),
        ),
        card('Где искать', null, h('div', { class: 'chips' }, LINKS.map(([name, url]) => h('a', { class: 'chip', href: url, target: '_blank', style: { textDecoration: 'none', color: 'inherit' } }, name)))),
      ),
    ),
  );
}
