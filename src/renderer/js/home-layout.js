// Pure rules for the customizable home screen (unit-tested): card order, visibility and the three columns.

/**
 * Full order for the known cards: the saved order first (ids of cards this version doesn't know stay where they
 * are, so a newer version's cards survive), then cards that are new since the order was saved, in default order.
 */
export function layoutOrder(saved, known) {
  const order = (saved || []).filter((id, i, a) => a.indexOf(id) === i);
  for (const id of known) if (!order.includes(id)) order.push(id);
  return order;
}

/** Moves a card one place up (-1) or down (+1) among the cards of the same group. */
export function moveCard(order, id, dir, sameGroup = () => true) {
  const list = [...order];
  const i = list.indexOf(id);
  if (i < 0) return list;
  let j = i + dir;
  while (j >= 0 && j < list.length && !sameGroup(list[j])) j += dir;
  if (j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

export function toggleHidden(hidden, id) {
  return hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
}

/** Splits cards into `n` columns row by row (card k goes to column k mod n), keeping their order. Returns id arrays. */
export function toColumns(cards, n = 3) {
  const cols = Array.from({ length: n }, () => []);
  cards.forEach((c, i) => cols[i % n].push(c.id));
  return cols;
}
