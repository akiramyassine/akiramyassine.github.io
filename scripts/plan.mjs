import { visualDistance } from './media.mjs';

export function planPublication(active, photos, decisions, categories) {
  const grouped = new Map();
  const eligible = [...new Set(active)].sort().filter(id => {
    const category = photos[id].analysis.category;
    return category && Object.hasOwn(categories, category);
  });
  const eligibleIds = new Set(eligible);
  for (const [photo, group] of Object.entries(decisions.groups)) {
    if (!photos[photo] || !photos[group]) throw new Error('Regroupement avec une empreinte inconnue.');
    if (decisions.groups[group] && decisions.groups[group] !== group) throw new Error('Utiliser directement l’empreinte de la photo de référence.');
    if (photos[photo].analysis.category !== photos[group].analysis.category) throw new Error('Regroupement de catégories différentes.');
  }
  for (const group of Object.keys(decisions.publish)) {
    if (!photos[group] || (decisions.groups[group] && decisions.groups[group] !== group)) {
      throw new Error('Publication sans photo de référence valide.');
    }
    const category = photos[group].analysis.category;
    if (!category || !Object.hasOwn(categories, category)) throw new Error('Publication avec une catégorie inconnue.');
  }
  for (const id of eligible) {
    const group = decisions.groups[id] ?? id;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(id);
  }

  const groups = [...grouped.entries()].map(([id, members]) => {
    const ordered = [id, ...members.filter(member => member !== id)].filter(member => eligibleIds.has(member));
    return { id, members: ordered, kind: decisions.publish[id], analysis: photos[ordered[0]].analysis };
  });
  const suggestions = [];
  const candidates = eligible.filter(id => !decisions.groups[id] && !decisions.publish[id]);
  for (const id of candidates) {
    const matches = eligible.filter(other => other !== id && photos[other].analysis.category === photos[id].analysis.category)
      .map(other => ({ other, distance: visualDistance(photos[id].visual, photos[other].visual) }))
      .filter(match => match.distance <= 7)
      .sort((a, b) => a.distance - b.distance || a.other.localeCompare(b.other))
      .slice(0, 5);
    if (matches.length) suggestions.push({ id, matches });
  }
  return {
    published: groups.filter(group => group.kind),
    drafts: groups.filter(group => !group.kind),
    rejected: [...new Set(active)].filter(id => !eligibleIds.has(id)).sort(),
    suggestions,
  };
}
