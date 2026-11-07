# MechForger

An application to build BattleMechs for the BattleTech game.

The first milestone covers **Introductory-level, Inner Sphere, 3025-era** construction
(TechManual rules):

- Biped mechs from 20 to 100 tons
- Standard structure, standard fusion engine (rating 10–400), standard gyro & cockpit
- Single heat sinks (10 free with the engine, up to rating ÷ 25 inside the engine)
- Standard jump jets (Jump MP ≤ Walk MP; torso and legs only)
- Standard armor (16 points/ton, half-ton increments, per-location maximums)
- 3025 weapons: lasers, PPC, flamer, machine gun, AC/2–AC/20, LRM 5–20, SRM 2–6 and their ammo
- Optional lower-arm / hand actuators, rear-mounted torso weapons
- Critical slot allocation with live validation, technical-readout text export,
  JSON import/export and saving in the browser

## Getting started

```bash
npm install
npm run dev      # start the app at http://localhost:5173
npm test         # rules-engine unit tests
npm run build    # type-check and production build
```

## Layout

- `src/rules/` — framework-free rules engine
  - `tables.ts` — engine weights, internal structure, gyro/jump jet weights
  - `equipment.ts` — weapon, ammo and equipment catalog
  - `construction.ts` — `computeMech()` derives weights, slots, heat and movement
  - `validation.ts` — `validate()` reports construction-rule errors and warnings
  - `edit.ts` — pure editing operations used by the UI
  - `readout.ts` — technical-readout text
- `src/data/canonical.ts` — sample designs (Locust, Wasp, Hunchback, Atlas), also used as test fixtures
- `src/ui/` — React interface

## Not yet supported

Split critical slots across locations, Battle Value, C-Bill cost, quads, and any
Standard/Advanced-level technology (Endo Steel, Ferro-Fibrous, XL engines,
double heat sinks, CASE, Clan tech, …).
