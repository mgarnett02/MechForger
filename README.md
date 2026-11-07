# MechForger

An application to build BattleMechs for the BattleTech game.

On launch MechForger asks which tech level (era) to build for, from 3025
onward; it can be changed later with **Change era**. Three eras are supported so far.

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
- **OmniMechs**: a fixed base chassis with any number of pod configurations
  (Prime, A, B, …) that can be added, copied, renamed and deleted; every
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

### Everywhere

- Critical slot allocation (click to place, or **Auto-allocate**) with live validation
- Red / amber / green status light: illegal, legal but incomplete (unused tonnage,
  unallocated armor), or fully legal
- Technical-readout text export, JSON import/export and saving in the app
- Light, dark or system theme, chosen in the start-up dialog

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
- `src/data/canonical.ts` — sample designs: 3025 canon mechs (Locust, Wasp, Hunchback, Atlas) and
  original samples for 3050 (Warden; the Grimfang OmniMech with Prime and A
  configurations) and 3062 (Bulwark, Emberclaw); also used as test fixtures
- `src/ui/` — React interface
- `electron/main.cjs` — desktop window wrapper; `build/icon.png` — app icon
- `.github/workflows/windows-build.yml` — automatic Windows builds

## Not yet supported

Split critical slots across locations, Battle Value, C-Bill cost, quads, and
eras after 3067. Mixed tech applies to equipment only: structure, engine, heat
sinks and armor follow the chassis tech base.
