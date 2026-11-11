import type { MechDesign, TechBase, TechComponent } from '../rules/types';
import { techOf } from '../rules/types';
import { setComponentTech } from '../rules/edit';

const LABELS: Record<TechComponent, string> = {
  structure: 'Structure', armor: 'Armor', engine: 'Engine', heatSinks: 'Heat sink',
};

/** Mixed tech: pick whether a component is Inner Sphere or Clan technology. Hidden on single-tech designs. */
export function TechPicker({ design, part, update }: {
  design: MechDesign; part: TechComponent; update: (fn: (d: MechDesign) => MechDesign) => void;
}) {
  if (!design.mixedTech) return null;
  return (
    <select aria-label={`${LABELS[part]} tech base`} className="tech-picker" value={techOf(design, part)}
      title="Mixed tech: this component's tech base"
      onChange={(e) => update((d) => setComponentTech(d, part, e.target.value as TechBase))}>
      <option value="IS">IS</option>
      <option value="Clan">Clan</option>
    </select>
  );
}
