/**
 * Вартість схеми, $/місяць.
 *
 * Трафікові статті (egress CDN і сховища) рахуються з першої, спокійної
 * хвилини: бюджет планують під звичайне навантаження, а не під пік.
 * Автоскейлінг оплачується за середньою кількістю інстансів за прогін —
 * саме тому він дешевший за постійний запас під пікове навантаження.
 */

export function computeCost(plan, series, carry) {
  const level = plan.level;
  const base = series[0];
  const items = [];
  for (const node of Object.values(plan.nodes)) {
    if (node.type === "client") continue;
    const history = carry?.history?.[node.id] ?? [];
    const avgInstances =
      node.def.clustered && node.cfg.autoscale && history.length
        ? history.reduce((sum, value) => sum + value, 0) / history.length
        : undefined;
    const load = base?.nodes?.[node.id]?.inflow ?? {};
    const cost = node.def.cost({ cfg: node.cfg, level, load, avgInstances });
    items.push({ id: node.id, label: node.label, type: node.type, cost });
  }
  items.sort((a, b) => b.cost - a.cost);
  return { total: items.reduce((sum, item) => sum + item.cost, 0), items };
}
