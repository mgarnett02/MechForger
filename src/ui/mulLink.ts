/**
 * Master Unit List page for a canon design. The MUL addresses units by a slug of their name
 * ("Atlas AS7-D(R)" -> https://masterunitlist.battletech.com/units/atlas-as7-dr): lower case, punctuation
 * dropped, spaces as hyphens.
 */
export function mulSlug(chassis: string, model: string): string {
  return `${chassis} ${model}`
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // accents: Araña -> arana
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

export function mulUrl(chassis: string, model: string): string {
  return `https://masterunitlist.battletech.com/units/${mulSlug(chassis, model)}`;
}
