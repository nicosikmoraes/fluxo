const WIDTH = 272, HEIGHT = 184, GAP = 64, LIMIT = 1000000;
const median = values => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const position = value => Math.round(Number(value));

function clusters(items, axis, tolerance, separateRows = false) {
 const groups = [];
 for (const item of [...items].sort((a, b) => a[axis] - b[axis] || a.id - b.id)) {
  const last = groups.at(-1);
  if (last && item[axis] - last[0][axis] <= tolerance && (!separateRows || !last.some(member => member.row === item.row))) last.push(item);
  else groups.push([item]);
 }
 return groups;
}

export function alignRoadmap(nodes, portals = []) {
 if (!nodes.length) return { nodes: [], portals: portals.map(({ id, x, y }) => ({ id, x, y })), rows: 0, columns: 0 };
 const items = nodes.map(({ id, x, y }) => ({ id, x: Number(x), y: Number(y) }));
 if (items.some(item => !Number.isFinite(item.x) || !Number.isFinite(item.y))) throw new Error('Há posições inválidas no mapa.');
 const rows = clusters(items, 'y', 64);
 const rowY = rows.map(row => position(median(row.map(item => item.y))));
 for (let index = 0; index < rows.length; index++) {
  if (index) rowY[index] = Math.max(rowY[index], rowY[index - 1] + HEIGHT + GAP);
  rows[index].forEach(item => { item.row = index; });
 }
 const columns = clusters(items, 'x', 96, true);
 const centers = columns.map(column => median(column.map(item => item.x)));
 const distances = centers.slice(1).map((center, index) => center - centers[index]);
 const ordinaryDistances = distances.filter(distance => distance >= WIDTH * .75 && distance <= WIDTH * 1.75);
 const observedPitch = ordinaryDistances.length ? median(ordinaryDistances) : WIDTH + GAP;
 const columnX = [position(centers[0])];
 distances.forEach((distance, index) => { columnX.push(columnX[index] + Math.max(1, Math.round(distance / observedPitch)) * (WIDTH + GAP)); });
 const aligned = columns.flatMap((column, index) => column.map(item => ({ id: item.id, x: columnX[index], y: rowY[item.row] }))).sort((a, b) => a.id - b.id);
 const originalById = new Map(items.map(item => [item.id, item])), alignedById = new Map(aligned.map(item => [item.id, item]));
 const portalPositions = [];
 for (const portal of portals) {
  const sources = (portal.sources || []).map(id => alignedById.get(id)).filter(Boolean);
  if (!sources.length) { portalPositions.push({ id: portal.id, x: position(portal.x), y: position(portal.y) }); continue; }
  sources.sort((a, b) => b.x - a.x || Math.abs(originalById.get(a.id).y + 92 - (portal.y + 48)) - Math.abs(originalById.get(b.id).y + 92 - (portal.y + 48)) || a.id - b.id);
  const anchor = sources[0];
  const oldRight = Math.max(...sources.map(source => originalById.get(source.id).x + WIDTH));
  const gap = Math.max(GAP, position(portal.x + 42 - oldRight));
  let x = anchor.x + WIDTH + gap - 42;
  const y = anchor.y + 44;
  const collides = () => aligned.some(node => x < node.x + WIDTH + 16 && x + 160 > node.x - 16 && y < node.y + HEIGHT + 16 && y + 140 > node.y - 16) || portalPositions.some(other => Math.abs(other.x - x) < 180 && Math.abs(other.y - y) < 160);
  while (collides() && x <= LIMIT) x += WIDTH + GAP;
  portalPositions.push({ id: portal.id, x, y });
 }
 if ([...aligned, ...portalPositions].some(item => item.x < 0 || item.y < 0 || item.x > LIMIT || item.y > LIMIT)) throw new Error('O alinhamento ultrapassa o limite do quadro. Mova os cards para mais perto da origem.');
 return { nodes: aligned, portals: portalPositions, rows: rows.length, columns: columns.length };
}

export function layoutSignature(nodes, portals = []) {
 const serialize = items => items.map(({ id, x, y }) => [String(id), Number(x), Number(y)]).sort((a, b) => a[0].localeCompare(b[0]));
 return JSON.stringify([serialize(nodes), serialize(portals)]);
}
