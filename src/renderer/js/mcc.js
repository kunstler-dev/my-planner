// Merchant category codes (ISO 18245) → standard expense categories. Unit-tested.
import { CAT } from './finance-calc.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const TABLE = [
  [CAT.food, [5411, 5412, 5422, 5441, 5451, 5462, 5499, 5811, 5812, 5813, 5814]],
  [CAT.transport, [4111, 4112, 4121, 4131, 4784, 4789, 5541, 5542, 7523]],
  [CAT.subscriptions, [4812, 4814, 4816, 4899, 5968]],
  [CAT.games, [5816]],
  [CAT.clothes, [5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699]],
  [CAT.health, [5122, 5912, ...range(8011, 8099)]],
  [CAT.education, [8211, 8220, 8241, 8244, 8249, 8299]],
  [CAT.fun, [7832, 7841, 7922, 7929, 7991, 7994, 7996, 7997, 7999]],
];
const BY_CODE = new Map(TABLE.flatMap(([cat, codes]) => codes.map((c) => [c, cat])));

/** Money transfers, card-to-card, account top-ups and cash: not income or expense by themselves. */
export const TRANSFER_MCC = new Set([4829, 6010, 6011, 6012, 6538, 6540]);

export const categoryForMcc = (mcc) => BY_CODE.get(Number(mcc)) || CAT.other;
export const isTransferMcc = (mcc) => TRANSFER_MCC.has(Number(mcc));
