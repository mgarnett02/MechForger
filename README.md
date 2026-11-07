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
  - `tables.ts` — engine weights, internal structure, gyro/jump jet weights
  - `equipment.ts` — weapon, ammo and equipment catalog
  - `construction.ts` — `computeMech()` derives weights, slots, heat and movement
  - `validation.ts` — `validate()` reports construction-rule errors and warnings
  - `edit.ts` — pure editing operations used by the UI
  - `readout.ts` — technical-readout text
- `src/data/canonical.ts` — sample designs (Locust, Wasp, Hunchback, Atlas), also used as test fixtures
- `src/ui/` — React interface
- `electron/main.cjs` — desktop window wrapper; `build/icon.png` — app icon
- `.github/workflows/windows-build.yml` — automatic Windows builds

## Not yet supported

Split critical slots across locations, Battle Value, C-Bill cost, quads, and any
Standard/Advanced-level technology (Endo Steel, Ferro-Fibrous, XL engines,
double heat sinks, CASE, Clan tech, …).
