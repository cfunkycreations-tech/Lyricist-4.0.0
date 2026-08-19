/**
 * How a multi-pick blend gets written into a prompt.
 *
 * Lives in utils rather than beside the picker on purpose: the services build
 * prompts and must not have to import a React component (and its CSS) to do it.
 *
 * A BARE LIST DOES NOT WORK. Handed "Country, Trap, Gospel" a model picks the
 * first one and writes a country song, because a list reads as a menu. Naming
 * the lead and saying the word fusion out loud is what produces a hybrid, and
 * order is meaning: Country + Trap is not the same song as Trap + Country.
 */
export const MAX_PICKS = 5;

export function blendPhrase(picks, kind = 'style') {
  const list = (picks || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  const [head, ...rest] = list;
  return `${list.join(' + ')} (a real fusion, not a list: ${head} leads the ${kind}, `
    + `with ${rest.join(', ')} woven through it)`;
}

/** Plain "A + B + C", for anywhere a label is wanted rather than an instruction. */
export function blendLabel(picks) {
  return (picks || []).filter(Boolean).join(' + ');
}
