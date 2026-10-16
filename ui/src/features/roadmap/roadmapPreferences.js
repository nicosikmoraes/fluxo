const key = (projectId) => `fluxo:roadmaps:${projectId}`;
export function readRoadmapPreferences(projectId) {
  try {
    const value = JSON.parse(localStorage.getItem(key(projectId)) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
export function saveRoadmapPreference(projectId, field, id) {
  try {
    localStorage.setItem(key(projectId), JSON.stringify({ ...readRoadmapPreferences(projectId), [field]: id }));
  } catch {
  }
}
export function chooseRoadmap(maps, preferences) {
  for (const id of [preferences.last, preferences.primary]) {
    const map = maps.find((map2) => map2.id === Number(id));
    if (map) return map.id;
  }
  return maps[0]?.id ?? null;
}
