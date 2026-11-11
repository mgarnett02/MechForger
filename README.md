# MechForger

A free, fan-made application to design BattleMechs and combat vehicles for the
BattleTech tabletop game.

## Legal Disclaimer

This software is a completely unofficial, fan-made tool and is not affiliated with, endorsed, or sponsored by Catalyst Game Labs, Topps, or Microsoft.

BattleTech, MechWarrior, BattleMech, and Mech are registered trademarks or trademarks of Topps and/or Microsoft Corporation in the United States and other countries. All original game rules and specifications are property of Catalyst Game Labs and Topps.

This tool is created strictly under the Microsoft Game Content Usage Rules using assets and rules from the BattleTech universe. It is distributed 100% free of charge, contains no monetization, no advertisements, and is meant purely for personal, non-commercial tabletop support.

On launch MechForger asks which tech level (era) to build for, from 3025
onward, then whether to build a BattleMech or a combat vehicle; it can be changed later with **Change era**. All eight eras are selectable.

### 3025 Succession Wars — Inner Sphere, Introductory rules

- Biped mechs from 20 to 100 tons
- Standard structure, standard fusion engine (rating 10–400), standard gyro & cockpit
- Single heat sinks (10 free with the engine, up to rating ÷ 25 inside the engine)
- Standard jump jets (Jump MP ≤ Walk MP; torso and legs only)
- Standard armor (16 points/ton, half-ton increments, per-location maximums)
- Lasers, PPC, flamer, machine gun, AC/2–AC/20, LRM 5–20, SRM 2–6 and their ammo
- Optional lower-arm / hand actuators, rear-mounted torso weapons

### 3050 Clan Invasion — Inner Sphere or Clan, Standard rules

Everything above, plus:

- **Endo Steel** structure (half weight; 14 slots IS / 7 Clan)
- **XL engines** (half weight; 3 slots per side torso IS / 2 Clan)
- **Double heat sinks** (dissipate 2; 3 slots IS / 2 Clan; cannot mix with singles)
- **Ferro-Fibrous** armor (×1.12 points/ton IS, ×1.2 Clan; 14 slots IS / 7 Clan)
- **CASE** (IS) and **MASC** (IS and Clan)
- IS weapons: ER and pulse lasers, ER PPC, Gauss rifle, LB-X and Ultra autocannons,
  Streak SRMs, MRMs, Narc, Anti-Missile System, Beagle probe, Guardian ECM
- The full Clan weapon list: ER/pulse lasers, ER PPC, Gauss, LB-X and Ultra ACs,
  LRM/SRM/Streak SRM, ATM, Narc, AMS, active probe, ECM
- **Artemis IV** fire control (one per LRM/SRM launcher, same location) and Artemis ammo
- **Targeting computers** (Clan: 1 t per 5 t of direct-fire weapons; the IS version
  arrives with the Civil War era)
- **Triple-Strength Myomer** (IS; 6 slots, +1 walking MP at 9+ heat; not with MASC)
- **C3** master computer and slave unit (IS)
- **Half-ton machine gun ammo**
- **Small craft and DropShips**: aerodyne and spheroid hulls, structural integrity, engine and fuel by
  tonnage, armor scaled to size, weapon bays, transport bays with doors, crew, quarters, life boats and
  escape pods, extra fire control, six-arc BV and cost as in MegaMek, and DropShip record sheets
- **JumpShips, WarShips and space stations**: K-F drive (standard, compact and sub-compact cores), jump
  sail, lithium-fusion battery, HPG, grav decks, docking collars, capital armor and structure, broadsides,
  capital and sub-capital weapons (naval lasers, PPCs, autocannon and Gauss, capital missiles, mass
  drivers, screen launchers) with capital-scale attack values, eight-arc WarShip BV, cost as in MegaMek,
  and large-craft record sheets
- **Battle armor**: PA(L) to assault suits, biped or quad (with turrets), squads of 1–6, ground, jump,
  VTOL and UMU movement, every BA armor type, manipulators, anti-personnel mounts and armored gloves,
  squad support weapons, detachable weapon packs, per-trooper equipment, slot and weapon limits per
  location, BV and cost as in MegaMek (the Elemental [Laser] point is 447 BV, as on the MUL), and a
  battle armor record sheet with each trooper's armor
- **Conventional infantry**: foot, jump, motorized, mechanized (wheeled, tracked, hover, VTOL, submarine),
  SCUBA and beast-mounted platoons; squad and platoon limits by motive type; primary and secondary
  weapons (about 370 personal and support weapons) with crew limits and capped damage per trooper;
  armor kits and sneak suits; anti-'Mech training; specializations (engineers, marines, mountain troops,
  paratroops, XCT and more); field guns; weight, BV and cost as in MegaMek; and an infantry record sheet
  with the damage-by-troopers table
- **Fighters**: aerospace fighters (including OmniFighters) and conventional fighters: engine rating from
  thrust, structural integrity, fuel, heat sinks, armor arcs with thresholds, five weapon slots per arc
  (less ferro-aluminum armor), matched wings, BV and cost as in MegaMek, and aerospace record sheets
  with attack values by range bracket
- **Land-Air 'Mechs**: standard and bimodal LAMs with conversion equipment, avionics and landing gear,
  AirMech and fighter movement, bomb bays and LAM fuel tanks, and the Interstellar Operations
  construction limits (as implemented by MegaMek)
- **Melee weapons**: hatchet, sword, mace, claw, retractable blade, chain whip, talons and spikes, with
  weight, slots, damage, BV and cost scaled to the mech, and actuator / one-per-arm checks
- **Quad BattleMechs**: four legs (front legs use leg structure and armor), leg actuators, weapons
  and jump jets in any leg, rear-facing leg weapons
- **OmniMechs**: a fixed base chassis with any number of pod configurations
  (Prime, A, B, …) that can be added, copied, renamed and deleted, each with its own lower arm
  and hand actuators; every
  configuration is validated and pod space is shown
- **Mixed tech** (Advanced rules): Inner Sphere and Clan equipment on one design;
  otherwise the two tech bases cannot be combined

Equipment introduced late in the era (3054–3061) is included too: Light and
Heavy Gauss rifles, TAG, and the Clan ER micro, micro pulse and heavy lasers,
light and heavy machine guns and light TAG.

### 3062 Civil War — Inner Sphere or Clan, Standard rules

Everything above, plus (Inner Sphere technology; Clan designs need mixed tech):

- **Light engines** (75% of standard weight; 2 slots per side torso)
- **XL gyros** (half weight, 6 slots) and **heavy-duty gyros** (double weight, 4 slots)
- **Small cockpits** (2 tons, frees two head slots)
- **Light Ferro-Fibrous** armor (×1.06 points/ton, 7 slots)
- Rotary AC/2 and AC/5, iNarc, Improved C3 and the Inner Sphere targeting computer
- Light, Heavy and Snub-Nose PPCs and ER flamers (IS and Clan), introduced 3067

### 3068 Jihad — Inner Sphere or Clan, Standard rules

Everything above, plus:

- **Compact engines** (150% weight, only 3 center-torso slots) and **compact gyros**
  (150% weight, 2 slots) — Inner Sphere
- **Heavy Ferro-Fibrous** armor (×1.24 points/ton, 21 slots) — Inner Sphere
- **Advanced structure**: Endo-Composite (75% weight; 7 slots IS / 4 Clan), Composite (half weight, half
  structure BV), Reinforced (double weight, double structure BV) and Endo Steel Prototype (16 slots)
- **Advanced armor**: Stealth (two fixed slots per side torso, arm and leg; needs ECM; +2 TMM and −10 heat
  efficiency in BV), Reactive, Reflective, Hardened (8 points/ton, −1 running MP), Ferro-Lamellor,
  Ballistic-Reinforced, Anti-Penetrative Ablation, Heat-Dissipating and Impact-Resistant, with MegaMek's
  points per ton, slots, BV multipliers and costs
- **CASE II** (1 t IS / 0.5 t Clan, 1 slot, any location; protects ammo even in the head, center torso,
  legs and XL/XXL side torsos)
- **Torso-mounted cockpits** (4 t; cockpit and sensors in the center torso, life support in each side torso,
  two sensor slots in the head; BV counts center torso armor twice, ×0.95) and **command consoles**
  (6 t, fills the head; initiative bonus on heavy and assault 'Mechs)
- **X-Pulse lasers** (IS), **Variable Speed Pulse lasers** (IS) and **improved heavy lasers** (Clan;
  explosive, −1 BV per slot)
- **Superchargers** (10% of engine weight, one slot in a location with engine slots; run at twice walking
  MP, 2.5× with MASC), **PPC Capacitors** (1 t, linked to a PPC in the same location; adds MegaMek's
  capacitor BV and 5 heat, explosive) and the **Angel ECM Suite** (2 t, 2 slots, 100 BV)
- **Split weapons**: weapons of 8 or more slots (AC/20, LB 20-X, Heavy Gauss, Arrow IV, Clan RAC/5…)
  can straddle an arm or leg and its side torso, or a side torso and the center torso. Choose the split
  in the equipment list, or click a location that is too full and the rest spills into the neighbour.
  Record sheets show both locations ("RA/RT"). In BV, the weapon counts as explosive if either part
  is unprotected.
- **Clan ER pulse lasers**, **Clan Streak LRMs** (half heat for BV, like Streak SRMs), **Clan rotary
  ACs** and IS **re-engineered lasers**
- **Artemis V** (Clan, 1.5 t, 2 slots): ×1.3 BV for the linked Clan LRM/SRM launcher. Artemis V ammo
  also gets ×1.3 BV and costs twice as much.
- **Coolant pods** (heat efficiency + ⌈heat sinks × pods / 5⌉ for BV; explosive), the Clan **light
  active probe**, and **A-, B- and M-Pods** (anti-infantry pods, counted as defensive equipment)
- **IndustrialMechs**: industrial structure (twice standard weight), fusion, fission, fuel cell and internal
  combustion engines (with 10/5/1/0 free heat sinks), commercial, industrial and heavy industrial armor,
  the industrial cockpit (no advanced fire control: +1 to hit, offensive BV ×0.9), Industrial TSM,
  environmental sealing, industrial equipment (lift hoists, saws, drills, backhoes, cargo and liquid
  storage…), no movement heat, the IndustrialMech restrictions and cost multiplier, 10–15-ton
  ultralight 'Mechs, and an IndustrialMech record sheet
- **Artillery**: Arrow IV (IS and Clan), Long Tom, Sniper and Thumper (indirect fire, range in mapsheets)
  and the Long Tom, Sniper and Thumper artillery cannons, with ammunition; usable on 'Mechs, vehicles and
  as infantry field artillery (one piece per platoon)
- **Light autocannons** (LAC/2, LAC/5) and one-shot **rocket launchers** (RL 10/15/20)
- **XXL engines** (a third of standard weight; 6 slots per side torso IS / 4 Clan; walk 4, run 6 and
  jump 2 per MP heat, 2 standing; BV structure ×0.25 IS / ×0.5 Clan)
- **Improved jump jets** (double weight and slots; jump up to running MP) — the Inner
  Sphere from 3068, the Clans already in 3050
- IS: Multi-Missile Launchers 3–9 (LRM or SRM ammo), Thunderbolt 5–20, Plasma Rifle,
  Magshot Gauss, light and heavy machine guns
- Clan: Hyper-Assault Gauss 20/30/40, AP Gauss Rifle, Plasma Cannon

### 3081 Early Republic, 3101 Late Republic, 3131 Dark Age, 3151 ilClan

Selectable, with all of the Standard-level technology above. The Standard
construction rules add little after the Jihad; most newer equipment is
Advanced or Experimental level and is not modeled yet.

### Combat vehicles (every era)

- Motive types: tracked (up to 100 t), wheeled (80 t), hover (50 t), VTOL (30 t),
  naval displacement hull (300 t), hydrofoil (100 t) and submarine (300 t)
- Engine rating = cruising MP × tonnage − suspension factor (rounded up to 5);
  ICE engines (2× standard weight, power amplifiers for energy weapons) or fusion,
  XL, Light and Compact engines with 50% extra shielding weight
- Structure (standard or Endo Steel), lift / rotor / dive equipment, control
  equipment (5%), optional turret (chin turret on VTOLs, 10% of its weapons)
- Armor up to 3.5 × tonnage + 40 points (VTOL rotor max 2), all armor types
- Item slots (5 + tonnage ÷ 5): one per weapon or item, one per ammunition type,
  plus Endo Steel / Ferro-Fibrous slots
- Only energy weapons generate heat; fusion engines include 10 heat sinks
- Weapons go in the front, sides, rear or turret; ammo and equipment in the body
- Original sample vehicles for each ground, air and naval type, plus a Clan tank (used by the test suite; not shown in the Load menu)

### Support vehicles (every era)

Built with the TechManual support vehicle rules: wheeled, tracked, hover, VTOL,
naval (with hydrofoil / submersible modifications), rail, airship and
fixed-wing.

- Small / medium / large size classes; chassis and engine weights from the
  base values for each type, scaled by structure and engine **tech ratings (A–F)**
- Engines: internal combustion, fusion, fission, fuel cell, battery, solar,
  steam, maglev, external power, or none (trailers); fuel by weight (fuel points
  shown for aircraft and airships)
- **BAR 2–10 armor** with weight per point by armor tech rating; nose / wing /
  aft armor for aircraft and airships
- **Chassis modifications** (armored, off-road, amphibious, tractor, trailer,
  environmental sealing, STOL, VSTOL, prop, hydrofoil, submersible, …)
- Basic / advanced fire control, turrets, power amplifiers and heat sinks for
  energy weapons
- Crew and passenger accommodations (seats, quarters) and cargo / troop space
- **Utility equipment** (searchlights, lift hoists, cargo containers, field
  kitchens, bulldozers, …), also available to combat vehicles
- Battle Value and cost are not calculated for support vehicles, and item
  slots are not checked

### Everywhere

- Critical slot allocation (click to place, or **Auto-allocate**) with live validation
- Red / amber / green status light: illegal, legal but incomplete (unused tonnage,
  unallocated armor), or fully legal
- **Canon units**: about 2,780 canon 'Mechs (about 110 of them IndustrialMechs), including 47 quads, 19 Land-Air 'Mechs and around 100 melee-armed designs (OmniMechs with all their
  configurations), 715 canon combat vehicles, 120 support vehicles, about 440 aerospace, Omni and
  conventional fighters and about 290 spacecraft (small craft, DropShips, JumpShips, WarShips and
  space stations), about 1,190 battle armor squads and about 1,940 infantry platoons, searchable by name, era, tech base,
  weight and type, ready to load, modify and print (see *Canon unit data* below)
  - Apocryphal (video-game and other non-canon) designs are left out. A canon design keeps its Master
    Unit List id: the editor shows it as a link to the unit's MUL page. Units without a MUL entry
    (mostly infantry built from the published rules) are marked **no MUL** in the browser, and an
    **On the MUL only** filter hides them
- **Battle Value (BV 2.0) and C-bill cost**, with the working shown; mech values
  reproduce published canon figures (e.g. Atlas AS7-D: BV 1,897, 9,626,000 C-bills).
  Vehicle values are marked as approximate
- **Printable record sheets** for BattleMechs (including every OmniMech configuration)
  and all vehicle types: weapons table, armor and structure boxes, critical slots,
  heat scale, warrior / crew and vehicle damage tracks, ammo counters; US Letter or
  A4, printed or saved as PDF from the print dialog
- Technical-readout text export
- Designs are saved and loaded as individual `.json` files (in the Windows app, Documents\MechForger by default), so they can be copied, moved or shared
- Light, dark or system theme, chosen in the start-up dialog

## Canon unit data

The bundled canon designs (`src/data/canon/`) are converted from
**[MegaMek Data](https://github.com/MegaMek/mm-data)** by the MegaMek Development
Team, licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The
converted data is shared under the same license and may not be used
commercially; see `src/data/canon/LICENSE.md`.

Only units MechForger can represent are included: biped mechs, combat
vehicles and support vehicles using modeled equipment. Quads, LAMs,
superheavies, OmniVehicles, Omni support vehicles, WiGE craft and units with Advanced or
Experimental equipment (stealth armor, CASE II, physical weapons, …) are
skipped. Of the converted mechs, 99% weigh exactly their published tonnage
under MechForger's tables, and Battle Values match the Master Unit List for
the checked designs. Weights match for about 92% of combat vehicles and 69% of
support vehicles (most others within half a ton); in the
browser, ⚖ marks a weight difference and ⚠ a failed construction check.

To regenerate the data from a checkout of mm-data:

```bash
npm run convert-canon -- /path/to/mm-data
```

## Download (Windows)

Every push to `main` builds Windows executables with GitHub Actions:

1. Open the repository's **Actions** tab → **Windows build** → the latest run.
2. Download the **MechForger-windows** artifact (a zip) at the bottom of the page.
3. Inside are two files:
   - `MechForger-Setup-x.y.z.exe` — installer (Start-menu shortcut, uninstaller)
   - `MechForger-Portable-x.y.z.exe` — runs directly, no install needed

Pushing a version tag (e.g. `git tag v0.2.0 && git push origin v0.2.0`) also
publishes both files on the repository's **Releases** page.

The executables are not code-signed, so Windows SmartScreen may warn the first
time: choose **More info → Run anyway**.

## Development

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev        # run in the browser at http://localhost:5173
npm run app        # run as a desktop app (Electron)
npm test           # rules-engine unit tests
npm run build      # type-check and production web build
npm run dist:win   # build the Windows installer + portable exe into release/
```

## Layout

- `src/rules/` — framework-free rules engine
  - `eras.ts` — tech levels offered at start-up
  - `tables.ts` — engine weights, internal structure, gyro/jump jet weights
  - `equipment.ts` — weapon, ammo and equipment catalog
  - `construction.ts` — `computeMech()` derives weights, slots, heat and movement
  - `validation.ts` — `validate()` reports construction-rule errors and warnings
  - `edit.ts` — pure editing operations used by the UI
  - `readout.ts` — technical-readout text
- `src/rules/vehicle.ts` — combat vehicle construction, validation and readout
- `src/rules/support.ts` — support vehicle construction, validation and readout
- `src/data/vehicles.ts` — sample vehicles
- `src/rules/battleValue.ts` + `src/rules/values.ts` — BV 2.0 and C-bill cost
- `src/rules/recordSheet.ts` + `src/ui/print/` — record sheet data and printable layout
- `src/data/canonical.ts` — sample designs: 3025 canon mechs (Locust, Wasp, Hunchback, Atlas) and
  original samples for 3050 (Warden; the Grimfang OmniMech with Prime and A
  configurations), 3062 (Bulwark, Emberclaw) and 3068 (Rampart, Cindermaw); also used
  as test fixtures
- `src/ui/` — React interface
- `electron/main.cjs` — desktop window wrapper; `build/icon.png` — app icon
- `.github/workflows/windows-build.yml` — automatic Windows builds

## Not yet supported

Some Advanced / Experimental equipment (e.g. rifles, Bloodhound probes, laser AMS), armored
components, patchwork armor, and per-configuration jump jet type or tech base on OmniMechs
(mixed-tech and improved-jump-jet configurations of a standard Prime are left out of the canon list).
Mixed tech applies to equipment only: structure, engine, heat
sinks and armor follow the chassis tech base.
