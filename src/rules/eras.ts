import type { TechBase } from './types';

/** Tech levels offered when starting MechForger, in chronological order. */

export type EraId =
  | '3025' | '3050' | '3062' | '3068' | '3081' | '3101' | '3131' | '3151';

export interface Era {
  id: EraId;
  /** Representative year used for equipment availability. */
  year: number;
  name: string;
  years: string;
  rulesLevel: 'Introductory' | 'Standard' | 'Advanced';
  /** Tech bases that can be built in this era. */
  techBases: readonly TechBase[];
  description: string;
  /** Whether MechForger can build mechs for this era yet. */
  available: boolean;
}

export const ERAS: readonly Era[] = [
  {
    id: '3025', year: 3025, name: 'Succession Wars', years: '3020–3049',
    rulesLevel: 'Introductory', techBases: ['IS'],
    description: 'Classic technology: standard fusion engines, single heat sinks, standard armor.',
    available: true,
  },
  {
    id: '3050', year: 3050, name: 'Clan Invasion', years: '3050–3061',
    rulesLevel: 'Standard', techBases: ['IS', 'Clan'],
    description: 'Recovered Star League tech (XL engines, Endo Steel, double heat sinks) and Clan equipment.',
    available: true,
  },
  {
    id: '3062', year: 3062, name: 'Civil War', years: '3062–3067',
    rulesLevel: 'Standard', techBases: ['IS', 'Clan'],
    description: 'Light engines, XL and heavy-duty gyros, small cockpits, rotary autocannons, iNarc and IS targeting computers.',
    available: true,
  },
  {
    id: '3068', year: 3068, name: 'Jihad', years: '3068–3080',
    rulesLevel: 'Advanced', techBases: ['IS', 'Clan'],
    description: 'Wartime innovation: XXL engines, experimental systems and exotic designs.',
    available: false,
  },
  {
    id: '3081', year: 3081, name: 'Early Republic', years: '3081–3100',
    rulesLevel: 'Standard', techBases: ['IS', 'Clan'],
    description: 'Post-Jihad demilitarisation; refined designs rather than radical new tech.',
    available: false,
  },
  {
    id: '3101', year: 3101, name: 'Late Republic', years: '3101–3130',
    rulesLevel: 'Standard', techBases: ['IS', 'Clan'],
    description: 'The Republic declines; more conversions, refits and IndustrialMech hybrids.',
    available: false,
  },
  {
    id: '3131', year: 3131, name: 'Dark Age', years: '3131–3150',
    rulesLevel: 'Standard', techBases: ['IS', 'Clan'],
    description: 'HPG blackout and rearmament; modern equipment fielded across the Sphere.',
    available: false,
  },
  {
    id: '3151', year: 3151, name: 'ilClan', years: '3151 onward',
    rulesLevel: 'Standard', techBases: ['IS', 'Clan'],
    description: 'The current era: the Clans hold Terra and tech bases blend further.',
    available: false,
  },
];

export const DEFAULT_ERA: EraId = '3025';

export function getEra(id: string): Era | undefined {
  return ERAS.find((e) => e.id === id);
}

export function techBasesLabel(era: Era): string {
  return era.techBases.map((t) => (t === 'IS' ? 'Inner Sphere' : 'Clan')).join(' & ');
}

/** Position in the timeline, for "available from era X onward" checks. */
export function eraIndex(id: EraId): number {
  return ERAS.findIndex((e) => e.id === id);
}

export function isAvailableIn(firstEra: EraId, era: EraId): boolean {
  return eraIndex(era) >= eraIndex(firstEra);
}
