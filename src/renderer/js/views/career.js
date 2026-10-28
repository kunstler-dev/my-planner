// Career: Ausbildung / job applications board, weekly goal, follow-up reminders, Bewerbung documents checklist and
// Grok helpers for Anschreiben and interview prep.
import { state, update } from '../state.js';
import { h, icon, uid, card, empty, toast } from '../ui.js';
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

function move(a, dir) {
  const idx = APP_STATUSES.findIndex(([k]) => k === a.status);
  const next = APP_STATUSES[Math.min(APP_STATUSES.length - 1, Math.max(0, idx + dir))][0];
  update((d) => {
    const i = d.career.applications.findIndex((x) => x.id === a.id);
    d.career.applications[i] = withStatus(d.career.applications[i], next);
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

function appCard(a) {
  const td = today();
  const due = a.followUp && a.followUp <= td && (a.status === 'sent' || a.status === 'interview');
  const idx = APP_STATUSES.findIndex(([k]) => k === a.status);
  return h(
    'div',
    { class: `kanban-card${due ? ' due' : ''}` },
    h(
      'div',
      { style: { cursor: 'pointer' }, onclick: () => appModal(a) },
      h('div', { class: 'title', style: { fontWeight: 600 } }, a.company),
      h('div', { class: 'meta' }, a.position),
      h('div', { class: 'row', style: { gap: '6px', marginTop: '6px', flexWrap: 'wrap' } }, h('span', { class: 'badge' }, kindLabel(a.kind)), a.city && h('span', { class: 'badge' }, a.city)),
      (a.sentAt || a.followUp) &&
        h('div', { class: 'meta', style: { marginTop: '6px' } }, [a.sentAt && a.status !== 'wish' && `отправлено ${prettyDate(a.sentAt)}`, due && '⏰ пора написать ещё раз'].filter(Boolean).join(' · ')),
    ),
    h(
      'div',
      { class: 'row', style: { gap: '2px', marginTop: '8px' } },
      idx > 0 && h('button', { class: 'btn ghost sm icon-only', title: 'Назад по статусу', onclick: () => move(a, -1) }, icon('left', 14)),
      h('div', { class: 'spacer' }),
      (a.status === 'wish' || a.status === 'sent') && h('button', { class: 'btn ghost sm', title: 'Написать Anschreiben с Grok', onclick: () => go('grok', { prompt: anschreibenPrompt(a) }) }, icon('spark', 13), 'Anschreiben'),
      a.status === 'interview' && h('button', { class: 'btn ghost sm', title: 'Подготовка к собеседованию с Grok', onclick: () => go('grok', { prompt: interviewPrompt(a) }) }, icon('spark', 13), 'Подготовка'),
      idx < APP_STATUSES.length - 2 && h('button', { class: 'btn ghost sm icon-only', title: 'Дальше по статусу', onclick: () => move(a, 1) }, icon('right', 14)),
    ),
  );
}

function tile(label, value, note, dark) {
  return h(
    'div',
    { class: `card stat${dark ? ' dark' : ''}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    note && h('div', { class: 'stat-note' }, note),
  );
}

function goalModal() {
  formModal('Цель на неделю', [{ key: 'weeklyGoal', label: 'Сколько откликов отправлять в неделю', type: 'number', required: true }], { weeklyGoal: state.data.career.weeklyGoal }, {
    onSave: (v) => {
      if (!(v.weeklyGoal > 0)) return false;
      update((d) => (d.career.weeklyGoal = Math.round(v.weeklyGoal)));
    },
  });
}

export function careerView() {
  const { applications, docs, weeklyGoal } = state.data.career;
  const st = careerStats(applications, today());
  const docsDone = docs.filter((x) => x.done).length;
  return h(
    'div',
    { class: 'page page-wide' },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Карьера'), h('div', { class: 'sub' }, 'Ausbildung и работа в Германии: отклики, ответы, документы')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => appModal(null) }, icon('plus', 16), 'Отклик')),
    ),
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      h(
        'button',
        { class: 'card stat dark', style: { textAlign: 'left', cursor: 'pointer' }, title: 'Изменить цель', onclick: goalModal },
        h('div', { class: 'stat-label' }, 'Откликов на этой неделе'),
        h('div', { class: 'stat-value' }, `${st.week} / ${weeklyGoal}`),
        h('div', { class: 'bar-track invert', style: { marginTop: '6px' } }, h('div', { class: 'bar-fill', style: { width: `${Math.min(100, (st.week / weeklyGoal) * 100)}%` } })),
      ),
      tile('Всего отправлено', String(st.sent), `в работе: ${applications.filter((a) => a.status === 'wish').length} в планах`),
      tile('Отвечают', st.sent ? `${Math.round(st.responseRate * 100)}%` : '—', 'приглашения и офферы / отправленные'),
      tile('Собеседования · офферы', `${st.interviews} · ${st.offers}`, st.followUps.length ? `⏰ написать повторно: ${st.followUps.length}` : 'напоминаний нет'),
    ),
    h(
      'div',
      { class: 'kanban', style: { marginBottom: '16px' } },
      APP_STATUSES.map(([k, label]) => {
        const list = applications.filter((a) => a.status === k).sort((a, b) => (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''));
        return h(
          'div',
          { class: 'kanban-col' },
          h('div', { class: 'kanban-head' }, h('span', {}, label), h('span', { class: 'muted' }, String(list.length))),
          list.map(appCard),
          k === 'wish' && h('button', { class: 'btn ghost sm', style: { width: '100%' }, onclick: () => appModal(null) }, icon('plus', 14), 'Добавить'),
        );
      }),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      card(
        'Документы для Bewerbung',
        h('span', { class: 'muted' }, `${docsDone} из ${docs.length}`),
        h(
          'div',
          { class: 'list' },
          docs.map((doc) =>
            h(
              'div',
              { class: `list-row${doc.done ? ' task-done' : ''}` },
              h(
                'button',
                { class: `check${doc.done ? ' on' : ''}`, onclick: () => update((d) => (d.career.docs.find((x) => x.id === doc.id).done = !doc.done)) },
                doc.done && icon('check', 13),
              ),
              h('div', { class: 'grow title' }, doc.title),
            ),
          ),
        ),
      ),
      card(
        'Написать повторно',
        null,
        st.followUps.length
          ? h(
              'div',
              { class: 'list' },
              st.followUps.map((a) =>
                h(
                  'div',
                  { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => appModal(a) },
                  h('div', { class: 'grow' }, h('div', { class: 'title' }, a.company), h('div', { class: 'meta' }, `${a.position} · с ${prettyDate(a.followUp)}`)),
                  h(
                    'button',
                    {
                      class: 'btn ghost sm',
                      onclick: (e) => {
                        e.stopPropagation();
                        go('grok', { prompt: `Напиши короткое вежливое письмо на немецком в ${a.company}: я отправил заявку на «${a.position}» ${prettyDate(a.sentAt)} и хочу узнать о статусе. Без навязчивости, 4–5 предложений.` });
                      },
                    },
                    icon('spark', 13),
                    'Письмо',
                  ),
                ),
              ),
            )
          : empty('Через неделю после отклика здесь появится напоминание написать в компанию.'),
      ),
      card(
        'Где искать',
        null,
        h(
          'div',
          { class: 'list' },
          LINKS.map(([name, url]) => h('a', { class: 'list-row', href: url, target: '_blank', style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'grow title' }, name), icon('up', 14))),
        ),
      ),
    ),
  );
}
