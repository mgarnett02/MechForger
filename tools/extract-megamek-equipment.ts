/**
 * Reads MegaMek's equipment source (GPL) as text and extracts the battle armor and infantry equipment that
 * MechForger needs: BA weapons, infantry weapons, BA ammunition, BA and infantry misc equipment and BA armor.
 *
 *   npx vite-node tools/extract-megamek-equipment.ts /path/to/megamek/megamek/src > src/data/megamek-equipment.json
 *
 * No MegaMek code is run; class inheritance and constructor assignments are resolved from the source text.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? '/home/user/megamek/megamek/megamek/src';
const COMMON = join(SRC, 'megamek/common');

type Raw = Record<string, string | number | null | string[]>;
interface Parsed { cls?: string; parent?: string; fields: Raw; lookups: string[]; flagsAdd: string[]; flagsDel: string[]; tech: Raw }

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.java') ? [p] : [];
  });
}

/** String constants from EquipmentTypeLookup (internal names). */
const LOOKUP = new Map<string, string>();
for (const file of [...walk(join(COMMON, 'equipment')), join(COMMON, 'battleArmor/BattleArmor.java'), join(COMMON, 'units/Infantry.java')]) {
  const cls = /(\w+)\.java$/.exec(file)![1];
  for (const m of readFileSync(file, 'utf8').matchAll(/static\s+final\s+String\s+(\w+)\s*=\s*"([^"]*)"/g)) {
    LOOKUP.set(`${cls}.${m[1]}`, m[2]);
    if (cls === 'EquipmentTypeLookup' || !LOOKUP.has(m[1])) LOOKUP.set(m[1], m[2]);
  }
}

function value(expr: string): string | number | null {
  const e = expr.trim();
  const s = /^"((?:[^"\\]|\\.)*)"$/.exec(e);
  if (s) return s[1].replace(/\\"/g, '"');
  if (LOOKUP.has(e)) return LOOKUP.get(e)!;
  const c = /^(?:EquipmentTypeLookup\.)?([A-Z][A-Z0-9_]+)$/.exec(e);
  if (c && LOOKUP.has(c[1])) return LOOKUP.get(c[1])!;
  if (/^DATE_NONE$/.test(e)) return null;
  if (/^(ITechnology\.)?DATE_PS$/.test(e)) return 1950;
  if (/^(ITechnology\.)?DATE_ES$/.test(e)) return 2100;
  const n = Number(e.replace(/[fFdD]$/, ''));
  if (e !== '' && Number.isFinite(n)) return n;
  // Simple arithmetic on literals (e.g. "0.5 * 2").
  if (/^[\d.\s+\-*/()]+$/.test(e)) {
    try { return Function(`return (${e})`)() as number; } catch { /* fall through */ }
  }
  const en = /\.(\w+)$/.exec(e);
  return en ? en[1] : e;
}

/** First intro date in an advancement call: prototype, else production, else common. */
function introYear(args: string): number | null {
  const parts = args.split(',').map((a) => value(a));
  for (const p of parts.slice(0, 3)) if (typeof p === 'number' && p > 0) return p;
  return null;
}

/** Parse assignments, lookups, flags and tech in a block of statements; `prefix` is e.g. "misc." */
function parseBody(body: string, prefix = ''): Parsed {
  const out: Parsed = { fields: {}, lookups: [], flagsAdd: [], flagsDel: [], tech: {} };
  const p = prefix.replace('.', '\\.');
  const text = body.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const stmt of text.split(';')) {
    const st = stmt.trim().replace(/^this\./, '').replace(/^(misc|ammo|armor)\.this\./, '$1.');
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^${p}setInternalName\\(([\\s\\S]*)\\)$`).exec(st))) {
      const v = value(m[1]);
      out.fields.internalName = v === 'name' ? (out.fields.name as string) : v;
      continue;
    }
    if ((m = new RegExp(`^${p}addLookupName\\(([\\s\\S]*?)(?:,\\s*(?:true|false))?\\)$`).exec(st))) {
      const v = value(m[1]);
      out.lookups.push(String(v === 'name' ? out.fields.name : v));
      continue;
    }
    if (new RegExp(`^${p}flags\\s*=`).test(st)) {
      for (const f of st.matchAll(/\.(or|andNot)\(\s*(?:\w+\.)?(F_\w+|S_\w+)\s*\)/g)) (f[1] === 'or' ? out.flagsAdd : out.flagsDel).push(f[2]);
      // misc.flags.or(F_A, F_B, ...)
      for (const f of st.matchAll(/\.or\(([^()]*)\)/g)) for (const x of f[1].split(',')) {
        const k = /(F_\w+|S_\w+)/.exec(x);
        if (k && !out.flagsAdd.includes(k[1])) out.flagsAdd.push(k[1]);
      }
      continue;
    }
    if (/techAdvancement/.test(st)) {
      const tb = /setTechBase\((?:\w+\.)?(\w+)\)/.exec(st);
      if (tb) out.tech.techBase = tb[1];
      const is = /setISAdvancement\(([^)]*)\)/.exec(st);
      if (is) out.tech.is = introYear(is[1]);
      const cl = /setClanAdvancement\(([^)]*)\)/.exec(st);
      if (cl) out.tech.clan = introYear(cl[1]);
      const both = /setAdvancement\(([^)]*)\)/.exec(st);
      if (both) out.tech.is = out.tech.clan = introYear(both[1]);
      const rating = /setStaticTechLevel\((?:\w+\.)?(\w+)\)/.exec(st);
      if (rating) out.tech.level = rating[1];
      continue;
    }
    if ((m = new RegExp(`^${p}(\\w+)\\s*=\\s*([\\s\\S]+)$`).exec(st))) {
      const [, k, v] = m;
      if (/^(rulesRefs|serialVersionUID|techAdvancement)$/.test(k)) continue;
      out.fields[k] = value(v);
    }
  }
  return out;
}

/** Text of the block starting at the first "{" at or after `start`. */
function block(src: string, start: number): string {
  const i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i + 1, j);
  }
  return '';
}

// ---------------------------------------------------------------- weapons (class per file)
const classes = new Map<string, Parsed>();
for (const file of walk(join(COMMON, 'weapons'))) {
  const src = readFileSync(file, 'utf8');
  const m = /(?:public|abstract)[\w\s]*\sclass\s+(\w+)(?:\s+extends\s+(\w+))?/.exec(src);
  if (!m) continue;
  const ctor = new RegExp(`(public|protected)\\s+${m[1]}\\s*\\(\\s*\\)`).exec(src);
  const parsed = ctor ? parseBody(block(src, ctor.index)) : { fields: {}, lookups: [], flagsAdd: [], flagsDel: [], tech: {} };
  classes.set(m[1], { ...parsed, cls: m[1], parent: m[2] });
}

function resolve(name: string, seen = new Set<string>()): Parsed | null {
  const c = classes.get(name);
  if (!c || seen.has(name)) return null;
  seen.add(name);
  const parent = c.parent ? resolve(c.parent, seen) : null;
  if (!parent) return c;
  const flags = new Set(parent.flagsAdd.filter((f) => !c.flagsDel.includes(f)));
  for (const f of c.flagsAdd) flags.add(f);
  return {
    cls: c.cls, parent: c.parent,
    fields: { ...parent.fields, ...c.fields, kind: c.fields.kind ?? parent.fields.kind ?? null },
    lookups: c.lookups, flagsAdd: [...flags], flagsDel: [], tech: { ...parent.tech, ...c.tech },
    // Remember the ancestry for damage formulas (LRM, SRM, ...).
  } as Parsed & { ancestry?: string[] };
}

function ancestry(name: string): string[] {
  const out: string[] = [];
  let n: string | undefined = name;
  while (n && classes.has(n) && !out.includes(n)) { out.push(n); n = classes.get(n)!.parent; }
  return out;
}

const record = (kind: string, p: Parsed, extra: Raw = {}) => ({
  kind,
  internalName: p.fields.internalName ?? p.fields.name,
  name: p.fields.name,
  lookups: p.lookups,
  flags: [...new Set(p.flagsAdd)].sort(),
  tech: p.tech,
  ...Object.fromEntries(Object.entries(p.fields).filter(([k]) => !['internalName', 'name', 'kind', 'shortName'].includes(k))),
  ...extra,
});

const weapons = [];
for (const [name, c] of classes) {
  if (!c.fields.internalName) continue;
  const r = resolve(name)!;
  const flags = new Set(r.flagsAdd);
  if (!flags.has('F_BA_WEAPON') && !flags.has('F_INFANTRY')) continue;
  weapons.push(record(flags.has('F_INFANTRY') ? 'infantryWeapon' : 'baWeapon', r, { ancestry: ancestry(name).slice(1) }));
}

// ---------------------------------------------------------------- misc / ammo / armor (factory methods)
function factories(file: string, prefix: string): Parsed[] {
  const src = readFileSync(join(COMMON, file), 'utf8');
  const out: Parsed[] = [];
  for (const m of src.matchAll(/(?:public|private|protected)\s+static\s+\w+\s+create(\w+)\s*\([^)]*\)\s*\{/g)) {
    const body = block(src, m.index! + m[0].length - 1);
    const p = parseBody(body, prefix);
    if (p.fields.name || p.fields.internalName) out.push({ ...p, cls: m[1] });
  }
  return out;
}

const misc = factories('equipment/MiscType.java', 'misc.')
  .filter((p) => p.flagsAdd.some((f) => f === 'F_BA_EQUIPMENT' || f === 'F_INF_EQUIPMENT' || f === 'F_BA_MANIPULATOR' || f === 'F_ARMOR_KIT'))
  .map((p) => record('misc', p, { factory: p.cls ?? null }));

const ammo = factories('equipment/AmmoType.java', 'ammo.')
  .filter((p) => p.flagsAdd.includes('F_BATTLEARMOR') || p.fields.kgPerShot !== undefined || /^BA|BA /.test(String(p.fields.internalName ?? '')))
  .map((p) => record('ammo', p, { factory: p.cls ?? null }));

const armor = factories('equipment/ArmorType.java', 'armor.')
  .filter((p) => p.flagsAdd.includes('F_BA_EQUIPMENT') || /^BA|BA /i.test(String(p.fields.internalName ?? p.fields.name ?? '')))
  .map((p) => record('baArmor', p, { factory: p.cls ?? null }));

// ---------------------------------------------------------------- compact output for MechForger
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const KEEP_FLAGS = /^(F_BA_WEAPON|F_INFANTRY|F_INF_\w+|F_MISSILE|F_BALLISTIC|F_ENERGY|F_PLASMA|F_LASER|F_PULSE|F_FLAMER|F_AMS|F_NARC|F_TAG|F_ARTILLERY|F_ONESHOT|F_DOUBLE_ONESHOT|F_BURST_FIRE|F_DIRECT_FIRE|F_BA_EQUIPMENT|F_BA_MANIPULATOR|F_AP_MOUNT|F_ARMORED_GLOVE|F_BASIC_MANIPULATOR|F_BATTLE_CLAW|F_MAGNET_CLAW|F_VIBROCLAW|F_MAGNETIC_CLAMP|F_CAMO_SYSTEM|F_ECM|F_ANGEL_ECM|F_BAP|F_JUMP_BOOSTER|F_MECHANICAL_JUMP_BOOSTER|F_MASC|F_PARTIAL_WING|F_DETACHABLE_WEAPON_PACK|F_SPACE_ADAPTATION|F_HEAT_SENSOR|F_ARMOR_KIT|F_INF_EQUIPMENT|F_BATTLEARMOR|F_ENCUMBERING|F_TOOLS|F_FIRE_RESISTANT|S_\w+)$/;
function compact(e: ReturnType<typeof record>) {
  const f = e as Record<string, unknown>;
  const t = e.tech as Raw;
  const techBase = t.techBase === 'CLAN' ? 'Clan' : t.techBase === 'IS' ? 'IS' : 'Both';
  const range = [f.minimumRange, f.shortRange, f.mediumRange, f.longRange, f.extremeRange].map((x) => num(x) ?? 0);
  const out: Record<string, unknown> = {
    id: e.internalName, name: e.name, kind: e.kind, techBase,
    introIS: num(t.is) ?? null, introClan: num(t.clan) ?? null,
    flags: e.flags.filter((x) => KEEP_FLAGS.test(x)),
  };
  if (e.lookups.length) out.lookups = e.lookups;
  for (const k of ['tonnage', 'criticalSlots', 'bv', 'cost', 'heat', 'rackSize', 'kgPerShot', 'shots', 'infantryDamage', 'infantryRange',
    'crew', 'ammoWeight', 'ammoCost', 'bursts', 'weightPerPoint', 'damageDivisor', 'damageShort', 'damageMedium', 'damageLong', 'damagePerShot']) {
    if (num(f[k]) !== undefined) out[k] = f[k];
  }
  for (const k of ['tonnage', 'criticalSlots', 'cost', 'bv']) if (typeof f[k] === 'string' && /VARIABLE/.test(String(f[k]))) out[k] = 'variable';
  if (typeof f.damage === 'number') out.damage = f.damage;
  else if (typeof f.damage === 'string') out.damage = String(f.damage).replace(/^DAMAGE_/, '').toLowerCase();
  if (typeof f.ammoType === 'string' && f.ammoType !== 'NA') out.ammoType = f.ammoType;
  if (typeof f.armorType === 'string') out.armorType = String(f.armorType).replace(/^T_ARMOR_/, '');
  if (e.kind === 'baWeapon' || e.kind === 'infantryWeapon') {
    if (range.some((x) => x)) out.range = range;
    out.parent = (f.ancestry as string[] | undefined)?.[0];
  }
  return out;
}
const all = [...weapons, ...misc, ...ammo, ...armor.filter((a) => !/^BAR/.test(String(a.internalName)))].map(compact);
// Keep the first entry per internal name.
const seen = new Set<string>();
const unique = all.filter((e) => (seen.has(String(e.id)) ? false : (seen.add(String(e.id)), true)));
process.stdout.write(JSON.stringify(unique));
process.stderr.write(`weapons ${weapons.length} (BA ${weapons.filter((w) => w.kind === 'baWeapon').length}), misc ${misc.length}, ammo ${ammo.length}, armor ${armor.length}; ${unique.length} entries\n`);
