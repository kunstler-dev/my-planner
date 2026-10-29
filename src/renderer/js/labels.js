// Display names for stored values that must not be renamed in data: standard categories, the three default
// accounts and the Bewerbung checklist (doc0–doc6). They are translated until the user changes them.
import { t, DICTS } from './i18n.js';
import { CATEGORY_KEYS } from './finance-calc.js';

// Names older versions wrote into data.json; while unchanged they count as the standard ones.
const LEGACY_ACCOUNTS = { trust: 'Trust Wallet (крипта)', ua: 'Украинская карта', de: 'Немецкая карта' };
const LEGACY_DOCS = [
  'Lebenslauf (резюме, с фото)',
  'Anschreiben — шаблон',
  'Zeugnisse — переводы аттестата/диплома',
  'Sprachzertifikat (B1/B2)',
  'Aufenthaltstitel / разрешение на работу',
  'Anerkennung — признание школьного аттестата',
  'Профиль на Arbeitsagentur / Azubiyo / Indeed',
];

export const catLabel = (c) => (CATEGORY_KEYS[c] ? t(`cat.${CATEGORY_KEYS[c]}`) : c || '');

/** A typed or picked category name → the stored value (a standard name in any language → its Russian key). */
export function catValue(label) {
  const v = String(label || '').trim();
  const low = v.toLowerCase();
  for (const [stored, key] of Object.entries(CATEGORY_KEYS)) {
    if (stored.toLowerCase() === low || Object.values(DICTS).some((d) => String(d[`cat.${key}`] || '').toLowerCase() === low)) return stored;
  }
  return v;
}

const isStandardAccount = (a) => a && LEGACY_ACCOUNTS[a.id] !== undefined && (!a.name || a.name === LEGACY_ACCOUNTS[a.id]);
export const accountName = (a) => (isStandardAccount(a) ? t(`acc.${a.id}`) : a?.name || '');
/** Name to store after editing: an untouched standard name stays as it was in data. */
export const accountNameValue = (a, typed) => (a && typed === accountName(a) ? a.name : typed);

const docIndex = (doc) => (/^doc[0-6]$/.test(doc?.id || '') ? Number(doc.id.slice(3)) : -1);
const isStandardDoc = (doc) => docIndex(doc) >= 0 && (!doc.title || doc.title === LEGACY_DOCS[docIndex(doc)]);
export const docTitle = (doc) => (isStandardDoc(doc) ? t(`doc.${doc.id}`) : doc.title);

// Where the rates came from ('nbu' | 'manual'); older files stored the source as Russian text.
const SOURCES = { nbu: 'nbu', manual: 'manual', НБУ: 'nbu', вручную: 'manual' };
export const rateSource = (rates) => SOURCES[rates?.source] || 'nbu';
