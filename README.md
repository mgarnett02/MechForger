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
- **CASE** (IS) and **MASC** (IS and Clan; any location, even the head as on the Locust LCT-6M)
- IS weapons: ER and pulse lasers, ER PPC, Gauss rifle, LB-X and Ultra autocannons,
  Streak SRMs, MRMs, Narc, Anti-Missile System, Beagle probe, Guardian ECM
- The full Clan weapon list: ER/pulse lasers, ER PPC, Gauss, LB-X and Ultra ACs,
  LRM/SRM/Streak SRM, ATM, Narc, AMS, active probe, ECM
- **Artemis IV** fire control (one per LRM/SRM launcher, same location) and Artemis ammo
- **Targeting computers** (Clan: 1 t per 5 t of direct-fire weapons; the IS version
  arrives with the Civil War era). As MegaMek, fluid guns, tasers, the RISC APDS, nail/rivet guns, the Centurion
  weapon system and Silver Bullet Gauss rifles are not direct fire; RISC laser pulse modules count
- **Triple-Strength Myomer** (IS; 6 slots, +1 walking MP at 9+ heat; not with MASC)
- **C3** master computer and slave unit (IS)
- **Half-ton machine gun ammo**
- **Small craft and DropShips**: aerodyne and spheroid hulls, structural integrity, engine and fuel by
  tonnage, armor scaled to size, weapon bays, transport bays with doors, crew, quarters, life boats and
  escape pods, extra fire control, six-arc BV and cost as in MegaMek, and DropShip record sheets.
  **Primitive** small craft and DropShips (Interstellar Operations, as MegaMek): engine, control and fuel
  factors by year of construction and 66% armor points. **ARTS** fighter and small craft bays (25% heavier,
  no bay crew, +1,000,000 C-bills) and the 50-ton **mobile HPG** (DropShips and larger)
- **Primitive JumpShips** (as MegaMek): a primitive K-F core of 5% + 3% per light-year of jump range
  (1–30), and engine, control, fuel and jump sail factors by year of construction; 66% armor points
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
  paratroops, XCT and more); field guns; **cybernetic augmentations** (dermal armor, TSM implants, pain
  shunts, cybernetic eyes, multi-modal and communication implants, gas effusers, suicide implants) and
  **disposable weapons** (grenades, LAW / V-LAW rockets, disposable lasers: 20% of their BV per trooper);
  weight, BV and cost as in MegaMek; and an infantry record sheet
  with the damage-by-troopers table
- **Fighters**: aerospace fighters (including OmniFighters) and conventional fighters: engine rating from
  thrust, structural integrity, fuel, heat sinks, armor arcs with thresholds, five weapon slots per arc
  (less ferro-aluminum armor), matched wings, BV and cost as in MegaMek, and aerospace record sheets
  with attack values by range bracket. **Primitive fighters**: 5-ton primitive cockpit, engine rated at
  1.2 × the normal rating (rounded up to 5) and primitive fighter armor (0.67 × points per ton)
- **Land-Air 'Mechs**: standard and bimodal LAMs with conversion equipment, avionics and landing gear,
  AirMech and fighter movement, bomb bays and LAM fuel tanks, and the Interstellar Operations
  construction limits (as implemented by MegaMek)
- **Superheavy 'Mechs** (Interstellar Operations, as MegaMek): 105–200 tons with their own structure table
  (doubled structure weight), superheavy gyro and cockpit, large engines up to 500, head armor up to 12,
  and two items' worth per critical slot (equipment takes half its usual slots, rounded up, and two tons
  of the same ammunition share a slot); no jump jets, MASC, TSM or armored components
- **Large engines** (rated 405–500) for any 'Mech, with 8 center-torso slots and double cost
- **Tripods**: a center leg with its own structure, armor and critical slots, 10% heavier structure and the
  tripod cockpit (superheavy tripods too)
- **QuadVees** (Clan, from 3130): conversion equipment (10% of tonnage), conversion gear in every leg, the
  QuadVee cockpit, and tracks (10%) or wheels (15%) for vehicle mode; conversion cost as MegaMek
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

### ProtoMechs (Clan, from 3059)

- **ProtoMechs** of 2–9 tons and **ultraheavy** ProtoMechs of 10–15 tons; biped, **quad** and
  **glider** (WiGE) configurations, with the engine rating, structure, armor maximums, torso / arm /
  main gun slot and weight limits and the heat-sink rule of MegaMek's ProtoMech validator
- Proto-sized missile launchers, a **main gun**, rear-firing torso weapons, ammunition bought by the
  shot, standard and **extended jump jets**, UMUs, the **myomer booster**, magnetic clamps, partial
  wings, ProtoMech melee weapons and the quad melee system, and **Electric Discharge ProtoMech armor**
- BV and cost as in MegaMek (gliders +1 TMM, the ProtoMech +0.1 defensive factor, melee weapons by
  tonnage, the EI interface free); a record sheet with the data block and five damage tracks for a point
- 86 canon ProtoMechs (85 legal; the Svartalfa 3 is 100 kg over under the published rules)

### Gun emplacements and handheld weapons (every era)

- **Gun emplacements**: weapons and equipment fitted in a building, with or without a turret; BV as in
  MegaMek (defensive equipment × 0.5, offense × 0.44 for 0 MP). MegaMek gives emplacements no cost, so
  MechForger shows the price of the weapons alone (the building is priced separately)
- **Handheld weapons** carried by 'Mechs with hands: armor (16 points per ton), up to six items, ammunition
  bought by the shot (one bin per kind), one-ton heat sinks for energy weapons, weight to the half ton, BV
  (armor × 2, no movement modifiers) and cost (twice the equipment) as MegaMek's TestHandheldWeapon
- About 725 canon gun emplacements and 29 canon handheld weapons (IS 'Mech mortars, hyper-velocity
  autocannon, cruise missiles, chemical lasers, rifles and vehicular grenade launchers are not in
  MechForger's catalog yet, so 93 files are skipped). Mobile structures and other buildings (MegaMek's
  *advanced buildings*) are not supported

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
- **Primitive 'Mechs:** primitive cockpit (5 t), engine rated at 1.2 × tonnage × walking MP (rounded up to 5), primitive armor (0.67 × points per ton). MegaMek's restrictions apply: standard or industrial structure, no XL / light / compact / XXL engines, standard myomer.
- **Interface cockpits** (4 t, two head slots; the 'Mech may go without a gyro) and **Clan laser heat sinks** (built like Clan double heat sinks)
- **Patchwork armor** (Tactical Operations, as MegaMek): a different armor type in any location. Each location
  holds its own armor's slots (e.g. 2 for Inner Sphere ferro-fibrous, 3 for heavy ferro-fibrous); weight sums
  every location at its own points per ton; BV and cost are figured per location
- **Mixed tech:** a mixed-tech 'Mech can take Clan or Inner Sphere structure, armor, engine and double heat sinks independently of its chassis (an IS / Clan picker appears beside each). Slots, armor points and engine side-torso slots follow each component's own tech base. OmniMech configurations can be mixed tech, or use a different jump jet type, on their own; configurations built on a different base chassis become a separate OmniMech.
- **Rules matching MegaMek:** Clan small cockpits (from 3080), rear-facing head and leg weapons, and industrial equipment on BattleMechs.
- **Actuator Enhancement System (AES):**
  - One per arm, or one in every leg. Weight is tonnage ÷ 35, rounded up to the half ton (÷ 50 for quads); slots are 1–4 by weight class.
  - Weapons and melee weapons in an AES arm count ×1.25 BV, and the BV tonnage factor rises.
  - It can't be combined with MASC or a targeting computer.
- **Partial wings:** a pair of pieces in the side torsos, weighing 7% of tonnage (Clan 5%). They add +2 jump MP (+1 over 55 t) and 3 heat capacity.
- **Null-signature, void-signature and chameleon systems:** one slot in every location except the head (the chameleon shield also skips the centre torso).
  - Their BV effects follow MegaMek: movement modifier and heat efficiency.
  - The void-signature system needs ECM. None of them can be combined with stealth armor, and the null- and void-signature systems can't be combined with C3 or a targeting computer.
- **Advanced weapons** (MegaMek stats and BV):
  - **Missiles:** extended LRMs, enhanced LRMs and improved ATMs.
  - **Gauss:** Silver Bullet and improved heavy Gauss rifles.
  - **Autocannons:** ProtoMech ACs.
  - **Flamers:** heavy and vehicle flamers. Ammo-fed flamers need no power amplifiers or heat sinks on vehicles.
  - **Machine gun arrays:** each is worth 0.67 × the matching machine guns in its location.
  - **Lasers and PPCs:** Blazer and light Blazer cannons, bombast laser, Clan improved large laser, Clan enhanced PPC.
  - **Special:** TSEMP cannon, 'Mech taser, fluid gun and Clan 'Mech mortars.
- **Electronics:** Bloodhound active probe, Watchdog and Nova CEWS, Apollo MRM FCS (MRM ×1.15 BV), C3 emergency master, drone operating system
- **Physical weapons and shields:** lance, small / medium / large vibroblades, small / medium / large shields (a medium shield costs one jump MP; a large shield stops jumping) and wrecking ball
- **Other systems:**
  - **UMUs:** underwater movement. They count in BV like MegaMek and can't be combined with jump jets.
  - **Tracks:** 10% of tonnage, one slot per leg.
  - **Radical heat sink system:** needs double heat sinks; adds ⌈heat sinks × 0.4⌉ heat capacity to BV.
  - **HarJel, the Blue Shield particle field damper, and modular armor:** modular armor adds 10 armor points and costs one jump MP.
- **Laser AMS** (Inner Sphere and Clan; defensive, no ammo) and the **C3 Boosted System** (master 6 t, slave 3 t)
- **Armored components** (Tactical Operations, from 3061): armor any equipment item ("Armored" in the
  equipment list) or system slot (engine, gyro, cockpit, sensors, life support, actuators; tick
  "Armor components" in the critical slot panel and click a slot). Each armored slot weighs 0.5 t; an
  armored cockpit weighs a flat ton. Each slot costs 150,000 C-bills. BV, as MegaMek: +5% of an item's BV per
  slot (+5 per slot with no BV), 5% of the gyro's BV per armored gyro slot, +5 per other system slot.
  Record sheets mark armored slots with ◆.
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

### Launchers and spacecraft equipment (as MegaMek)

- **One-shot (OS)** and **improved one-shot (I-OS)** versions of SRM, Streak SRM, LRM, Clan Streak LRM, torpedo and
  Narc / iNarc launchers: OS +0.5 t, I-OS −0.5 t (from 3056), no ammunition, 1/5 of the launcher's BV, half (OS)
  or 80% (I-OS) of its cost, a quarter of its heat for BV
- **LRT / SRT torpedoes** (Inner Sphere and Clan): LRM / SRM launchers that fire only underwater, with their own,
  Artemis IV and Artemis V ammunition
- **Spacecraft equipment**: small and large naval comm-scanner suites (100 t / 500 t), naval C3 (1% of the craft),
  naval tug adaptor (100 t + 10%), Caspar, Caspar II and improved drone control systems (a share of the craft by
  type), look-down radar, hyperspectral and high-resolution imagers, SDS self-destruct systems, booby traps and
  spacecraft MASH

### More weapons and equipment (MegaMek stats, BV and cost)

- **Weapons:** Clan chemical lasers; Clan improved autocannons, Gauss rifle, LRMs and SRMs; prototype weapons
  (ER and pulse lasers, Streak SRMs, UAC/10, LB 10-X, Gauss rifle, rocket launchers; they share the standard
  weapon's ammunition, and prototype lasers count their extra 1d6 heat for BV as MegaMek does); primitive
  autocannons and PPC; light / medium / heavy rifles; HVACs; 'Mech mortars; cruise missiles 50–120; TSEMP
  one-shot and repeating cannons; vehicular grenade launcher; nail / rivet gun; RISC hyper laser; APDS;
  C3 remote sensor launcher; Centurion weapon system; flail
- **Ammunition:** flak autocannon ammo (×1.5 cost); Artemis IV ammo for enhanced and improved LRMs (both take
  Artemis IV)
- **Equipment:** HarJel II / III (armor BV ×1.1 / ×1.2 in their location), MASS, laser insulator (−1 heat for
  one laser), chaff pod, EW equipment, RISC viral jammers, emergency coolant and laser pulse module, drone
  command console, collapsible command module, light / medium / heavy bridge layers, fluid suction systems,
  infrared imager, extended fuel tanks, vehicle escape pod, cockpit command console, flotation hull
  (vehicle cost ×1.25 with it or vehicle environmental sealing), smart robotic control systems (5–7% of
  tonnage), drone carrier control system (2 t + 0.5 t per drone) and vehicle MASH units
- **'Mechs:** prototype jump jets (built as standard jets, +3 to the landing roll); prototype "freezer"
  double heat sinks (1 t, 3 slots, mounted with single heat sinks, each dissipating 2); **head, shoulder and
  quad turrets** (a tenth of the turret-mounted equipment, rounded up to the half ton; tick "Turret" on an
  item; turret and arm weapons stay out of the front/rear BV halving, as MegaMek)
- **Fighters:** reflective (1 slot), ferro-lamellor (2 slots) and stealth (2 slots, needs ECM) armor, and XXL
  engines
- **More 'Mech components:** compact heat sinks (Inner Sphere: 1.5 t, two per slot, twice as many in the
  engine), RISC super-cooled myomer (6 slots, no walking or running heat), prototype ferro-fibrous armor
  (16 slots), prototype improved jump jets (standard weight, jump to running MP, 2 heat per MP), the
  virtual-reality piloting pod (a torso-mounted cockpit, BV × 1.4), the RISC heat sink override kit
  (BV × 1.01), mechanical jump boosters (jump MP without heat; 2 slots per leg, 5% of tonnage per MP), the ram
  plate (one slot per torso, a tenth of tonnage), the chain drape cape (−1 walking MP) and dumpers (5% of the
  cargo beside them)
- **FrankenMeks** (Campaign Operations, as MegaMek): each location from a donor 'Mech with its own structure
  type, tech base and tonnage; structure points from the donor tonnage, structure weight as each donor's share
  (head 5%, center torso 25%, side torsos 15%, limbs 10%), Endo slots in their own locations, jump jets weighed
  by their location's donor, armor maximums from each location's structure; legs no lighter than the center
  torso, no OmniMechs
- **Special munitions** as their own ammunition, with MegaMek's prices: LB-X cluster, ATM extended-range and
  high-explosive, Narc-capable LRM / SRM / MML, Artemis-capable MML, Arrow IV homing and cluster, SRM inferno,
  LRM Swarm-I and semi-guided, and flak autocannon ammunition
- **Large craft:** autonomous and direct tactical analysis computers (2% / 3% of the craft plus 150 t per
  drone), drone carrier control and space mine dispensers

### Combat vehicles (every era)

- Motive types: tracked (up to 100 t), wheeled (80 t), hover (50 t), VTOL (30 t),
  WiGE (80 t, at least 5 cruise MP), naval displacement hull (300 t), hydrofoil (100 t) and submarine (300 t)
- **Superheavy vehicles** (as MegaMek): tracked to 200 t, wheeled and WiGE to 160 t, hover to 100 t, VTOL to
  60 t, naval and submarine to 555 t; superheavy suspension factors, large engines (to 500), double-weight
  structure (not on naval vehicles), and six armor facings (front, front and rear sides, rear) on ground and
  naval superheavies
- Engine rating = cruising MP × tonnage − suspension factor (rounded up to 5);
  ICE engines (2× standard weight, power amplifiers for energy weapons other than chemical lasers and vehicle
  flamers), fuel cells (1 free heat sink), fission (5 free heat sinks) or fusion, XL, XXL, Light and Compact
  engines with 50% extra shielding weight; heat sinks cover energy weapons, each laser insulator taking 1 heat
  off a laser (minimum 1)
- Mixed tech: the armor may be Clan or Inner Sphere whatever the chassis (e.g. Clan ferro-fibrous at 19.2 points
  a ton on an Inner Sphere chassis); Clan CASE weighs nothing
- **OmniVehicles** (cost ×1.25; the turret weight is fixed by the base chassis) and **trailers**
  (no engine or cruise MP needed, optionally no control systems)
- Chassis modifications: fully and limited amphibious (tracked and wheeled), environmental sealing
  and the Inner Sphere / Clan armored motive system; superchargers (not on VTOLs)
- Structure (standard or Endo Steel), lift / rotor / dive equipment, control
  equipment (5%), optional turret (chin turret on VTOLs, 10% of its weapons)
- **Dual turrets** (front and rear, each 10% of its weapons, own armor; not on VTOLs) and **sponson turrets**
  (a pair on the sides, 10% of the sponson-mounted weapons, 4,000 C-bills a ton), as MegaMek
- **Vehicle jump jets** (hover, wheeled, tracked and WiGE; one per jump MP up to cruise MP, weighing as 'Mech
  jump jets, all together one item slot; not with sponson turrets) and the **VTOL jet booster** (10% of the
  engine; flank speed twice cruise)
- Armor up to 3.5 × tonnage + 40 points (VTOL rotor max 2): all 'Mech armor types plus
  reactive, reflective, hardened, ferro-lamellor, ballistic-reinforced and vehicular stealth (needs ECM)
- Item slots (5 + tonnage ÷ 5): one per weapon or item, one per ammunition type,
  plus Endo Steel / Ferro-Fibrous slots
- Only energy weapons (and vehicular stealth armor, 10 heat) generate heat; fusion engines include 10 heat sinks
- Weapons go in the front, sides, rear or turret; ammo and equipment in the body
- Original sample vehicles for each ground, air and naval type, plus a Clan tank (used by the test suite; not shown in the Load menu)

### Support vehicles (every era)

Built with the TechManual support vehicle rules: wheeled, tracked, hover, VTOL,
WiGE, naval (with hydrofoil / submersible modifications), rail, airship and
fixed-wing (MegaMek's support tanks, large support tanks, support VTOLs and
fixed-wing support).

- Small / medium / large size classes; chassis and engine weights from the
  base values for each type, scaled by structure and engine **tech ratings (A–F)**
- Engines: internal combustion, fusion, fission, fuel cell, battery, solar,
  steam, maglev, external power, or none (trailers); fuel by weight (fuel points
  shown for aircraft and airships)
- **BAR 2–10 armor** with weight per point by armor tech rating; nose / wing /
  aft armor for aircraft and airships. **Large** ground support vehicles (large support tanks) have six
  facings: front, front-right, front-left, rear-right, rear-left and rear.
- **OmniVehicle** chassis modification. Each canon Omni configuration loads as its own design.
- **Chassis modifications** (armored, off-road, amphibious, tractor, trailer,
  environmental sealing, STOL, VSTOL, prop, hydrofoil, submersible, …)
- Basic / advanced fire control, turrets, power amplifiers and heat sinks for
  energy weapons
- Crew and passenger accommodations (seats, quarters) and cargo / troop space
- **Transport bays**, weighed as in MegaMek:
  - **Infantry bays:** 5, 6 or 7 t per foot, jump or motorized platoon; 8 t per mechanized squad.
  - **Battle armor bays:** 8 t per squad (Clan 10 t per point, ComStar 12 t).
  - **Unit bays:** ProtoMech 50 t per point, light vehicle 50 t, heavy vehicle 100 t, 'Mech 150 t.
  - **Livestock bays:** capacity ÷ 0.83.

  Each bay has its own door count. Bays appear in the readout and on the record sheet.
  Spacecraft battle armor bays also take the Clan / ComStar variants, and spacecraft can have
  infantry compartments. Fighters can carry troop / cargo space.
- **Utility equipment** (searchlights, lift hoists, cargo containers, field
  kitchens, bulldozers, MASH units, ladders, sprayers, …), also available to combat vehicles
- **Infantry weapons** (over 300, with MegaMek's figures; the only weapons a small support vehicle may carry):
  each weighs what the weapon does and carries one ammunition clip, with more clips at the weapon's ammo
  weight and cost; fire control does not change their BV. **Pintle turrets** on small support vehicles weigh
  a twentieth of their weapons (1,000 C-bills per ton)
- Spacecraft imagers and look-down radar, command consoles and superchargers (10% of the engine, 10,000
  C-bills per engine ton, doubled cruise MP for BV)
- Non-BAR armor (Advanced rules): any combat-vehicle armor type, weighed by its points per ton and rated
  BAR 10
- **Item slots** (5 + tonnage ÷ 10, as MegaMek's validator): weapons and electronics take their 'Mech critical
  slots (artillery, cruise missiles and a few others their own counts), infantry weapons and industrial or utility
  equipment one, each kind of ammunition one (none on small support vehicles), jump jets one in all, armor as
  combat vehicles (BAR 10 at tech rating E or F: 2 / 1), each cargo or unit bay one (all troop space together one;
  seats none), and quarters beyond the minimum crew one per 5 (first class), 20 (second class and crew) or 50
  (steerage) people. The minimum crew (drivers, gunners by weapon tonnage or facing, and operators for
  communications, MASH units, field kitchens and mobile field bases) is shown in the editor

### Everywhere

- Critical slot allocation (click to place, or **Auto-allocate**) with live validation
- Red / amber / green status light: illegal, legal but incomplete (unused tonnage,
  unallocated armor), or fully legal
- **Canon units**: about 3,380 canon 'Mechs (about 110 of them IndustrialMechs), including 47 quads, 19 Land-Air 'Mechs, 3 superheavies, 5 tripods (with the Ares superheavy tripod OmniMech), 5 QuadVee designs and around 100 melee-armed designs (OmniMechs with all their
  configurations), about 1,210 canon combat vehicles (10 superheavies) (OmniVehicles with all their configurations), about 230 support vehicles, about 540 aerospace, Omni, primitive and
  conventional fighters and about 425 spacecraft (small craft, DropShips, JumpShips, WarShips and
  space stations), about 1,190 battle armor squads, 86 ProtoMechs, about 1,060 gun emplacements and handheld weapons and about 1,990 infantry platoons, searchable by name, era, tech base,
  weight and type, ready to load, modify and print (see *Canon unit data* below)
  - Apocryphal (video-game and other non-canon) designs are left out. A canon design keeps its Master
    Unit List id: the editor shows it as a link to the unit's MUL page. Units without a MUL entry
    (mostly infantry built from the published rules) are marked **no MUL** in the browser, and an
    **On the MUL only** filter hides them
- **Battle Value (BV 2.0) and C-bill cost**, with the working shown, for every unit type (support
  vehicles included), checked against MegaMek's own calculators over the canon units. Share of canon
  units whose value equals MegaMek's exactly:

  | Unit type | BV | Cost |
  |---|---|---|
  | BattleMechs (3,167 compared) | 99.9% | 86% (95% within 2%) |
  | Combat vehicles (1,208) | 99.6% | 59% (77% within 2%; marked approximate) |
  | Support vehicles (229) | 97% | 92% (94% within 2%) |
  | Aerospace / conventional fighters (542) | 99.6% | 74% (95% within 2%) |
  | Small craft, DropShips, JumpShips, WarShips, stations (428) | 99% (99.8% within 2%) | 67% (99.8% within 2%) |
  | ProtoMechs (86) | 100% | 100% |
  | Gun emplacements and handheld weapons (1,058) | 98% | (emplacements have no cost in MegaMek) |

  The comparison uses MegaMek's calculated BV; some unit files carry a published (manual) BV that MegaMek
  reports instead.

  Known differences: MegaMek rates non-BAR armor on support vehicles as BAR 0 for BV (MechForger uses BAR 10,
  as the rules do), charges ICE 'Mechs with fewer than 10 heat sinks a negative heat-sink cost (MechForger
  charges nothing), and a few canon files share a name with another design. Every remaining BV difference has
  been checked and is a MegaMek slip or a canon-data issue MechForger corrects: MegaMek halves turret and side
  weapons on superheavy tanks (it checks the ordinary tank's turret location), counts a superheavy's rear weapons
  in full, drops stealth armor's +2 on units with no MP of their own, links only one PPC capacitor per spacecraft
  bay (outside the arc multiplier), links rear-arc Artemis to forward extended LRMs and one machine gun per array on gun emplacements, halves handheld half-ton ammunition twice, applies a
  drone operating system twice on fighters, and rounds 0.5 down; and a few canon files load Inner Sphere ammunition
  into Clan launchers, which MechForger converts to the launcher's own ammunition. Spacecraft ammunition bins are priced as MegaMek does (one
  ton's price per bin, whatever its size), which is below the TechManual's per-ton price for big bins
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

Only units MechForger can represent are included: 'Mechs (biped, quad, tripod, QuadVee, LAM and
superheavy), combat vehicles (superheavies too) and support vehicles using modeled equipment. Units with
equipment MechForger does not model yet are skipped. Of the converted mechs, 99% weigh exactly their published tonnage
under MechForger's tables, and Battle Values match the Master Unit List for
the checked designs. Weights match for about 93% of combat vehicles (99% pass every construction check) and 71% of
support vehicles (most others within half a ton); in the
browser, ⚖ marks a weight difference and ⚠ a failed construction check.

Every canon unit MegaMek's validator accepts also passes MechForger's checks, except the Svartalfa 3 ProtoMech
(its file is 0.1 t over in MegaMek's own breakdown too). To get there the converter:
- marks a unit mixed tech when it carries the other tech base's equipment or armor even though its file does not say so;
- reads the **Illegal Design** quirk (Caveat Emptor and RISC designs that deliberately break the rules, such as the
  Carbine CON-9M-D MOD, Crosscut IIC and Malice MAL-Y-SH-RISC). Their rule breaches show as warnings; the quirk is a
  checkbox on the 'Mech chassis panel. Every record sheet prints "Construction: Legal" or "Illegal" (naming the quirk
  when it applies);
- places armor critical slots a file leaves out into free slots (as on the Great Wyrm 2 and Shogun C 2);
- converts specialized cargo bays from capacity to weight (insulated and refrigerated ÷ 0.87, liquid ÷ 0.91).

As MegaMek, mixed-tech 'Mechs may combine Inner Sphere and Clan double heat sinks, and industrial and heavy industrial
armor may be patchwork. Support vehicles may mount vehicle jump jets and the armored motive system, and their battle
armor bays may hold part squads. The battle armor myomer booster takes one slot per piece, three pieces in all.

To regenerate the data from a checkout of mm-data:

```bash
npm run convert-canon -- /path/to/mm-data
```

## Download (Windows)

Every push to `main` builds Windows executables with GitHub Actions:

1. Open the repository's **Actions** tab → **Windows build** → the latest run.
2. Download the **MechForger-windows** artifact (a zip) at the bottom of the page.
3. Inside are three files:
   - `MechForger-Setup-x.y.z.exe`: the installer (Start-menu shortcut, uninstaller). **Fastest to start; recommended.**
   - `MechForger-x.y.z-win.zip`: no install needed. Unzip it once to any folder and run `MechForger.exe`.
     It starts as quickly as the installed version.
   - `MechForger-Portable-x.y.z.exe`: a single file that runs without installing. It unpacks the
     whole app (about 250 MB, Electron included) to a temporary folder **every time it starts**, so it
     takes several seconds longer to open, especially while Windows Defender scans the unpacked files.

Pushing a version tag (e.g. `git tag v0.2.0 && git push origin v0.2.0`) also
publishes these files on the repository's **Releases** page.

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
npm run dist:win   # build the Windows installer, zip and portable exe into release/
```

### Checking against MegaMek

`tools/megamek-check/run.sh <megamek checkout> <mm-data checkout> [kind]` runs MegaMek's own BV and cost
calculators over the canon unit files and compares them with MechForger's (`kind` is one of mechs,
vehicles, support, fighters, vessels, protomechs, stationary). The MegaMek checkout must be compiled first
(`gradle :megamek:compileJava`). `Rep.java` prints MegaMek's itemized BV and cost report for one unit, and
`VerA.java` runs MegaMek's spacecraft validator.

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

Chain drape aprons and ponchos, munitions no canon unit carries (smoke,
tandem-charge, and so on), and per-configuration jump jet type or tech base on OmniMechs
(mixed-tech and improved-jump-jet configurations of a standard Prime are left out of the canon list).

