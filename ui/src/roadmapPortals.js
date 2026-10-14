const key = roadmapId => `fluxo:roadmap-portals:${roadmapId}`;
const coordinate = value => Math.min(1000000, Math.max(0, Math.round(Number(value) || 0)));

export function readPortals(roadmapId) {
 try {
  const stored = JSON.parse(localStorage.getItem(key(roadmapId)) || '[]');
  if (!Array.isArray(stored)) return [];
  const ids = new Set();
  return stored.filter(item => item && typeof item.id === 'string' && !ids.has(item.id) && ids.add(item.id)).map(item => ({
   id: item.id, label: typeof item.label === 'string' ? item.label.slice(0, 160) : '',
   x: coordinate(item.x), y: coordinate(item.y),
   sources: Array.isArray(item.sources) ? [...new Set(item.sources.filter(id => Number.isInteger(id) && id > 0))] : [],
  }));
 } catch { return []; }
}

export function savePortals(roadmapId, portals) {
 try { localStorage.setItem(key(roadmapId), JSON.stringify(portals)); return true; }
 catch { return false; }
}
