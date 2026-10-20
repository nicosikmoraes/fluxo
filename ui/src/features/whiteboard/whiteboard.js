export const MAX_ELEMENTS = 1500;
export const strokes = [
  { value: "#454157", label: "Grafite" }, { value: "#6d62cf", label: "Violeta" },
  { value: "#4c78cc", label: "Azul" }, { value: "#3c907c", label: "Verde" },
  { value: "#c26a65", label: "Coral" }, { value: "#b48a36", label: "Mostarda" },
];
export const fills = [
  { value: "transparent", label: "Sem preenchimento" }, { value: "#eee9fb", label: "Lavanda" },
  { value: "#e5efff", label: "Céu" }, { value: "#e2f2e9", label: "Menta" },
  { value: "#fbe5dd", label: "Pêssego" }, { value: "#fff1b8", label: "Amarelo" },
];
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const uid = () => crypto.randomUUID();
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const isPath = (element) => ["pen", "line", "arrow"].includes(element.type);
export function createElement(type, x, y, style = {}) {
  return { id: uid(), type, x, y, width: type === "note" ? 216 : type === "text" ? 240 : 0,
    height: type === "note" ? 180 : type === "text" ? 52 : 0,
    stroke: style.stroke || "#454157", fill: type === "note" ? (style.fill === "transparent" ? "#fff1b8" : style.fill || "#fff1b8") : style.fill || "transparent",
    strokeWidth: style.strokeWidth || 2, fontSize: style.fontSize || 20, text: "", points: [], groupId: null };
}
export function bounds(elements) {
  if (!elements.length) return null;
  const x = Math.min(...elements.map((item) => item.x));
  const y = Math.min(...elements.map((item) => item.y));
  return { x, y, width: Math.max(...elements.map((item) => item.x + item.width)) - x,
    height: Math.max(...elements.map((item) => item.y + item.height)) - y };
}
export function intersects(a, b) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
function segmentDistance(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((point.x - a[0]) * dx + (point.y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(point.x - a[0] - t * dx, point.y - a[1] - t * dy);
}
export function hitTest(element, point, tolerance = 6) {
  const p = { x: point.x - element.x, y: point.y - element.y };
  const w = element.width, h = element.height;
  if (p.x < -tolerance || p.y < -tolerance || p.x > w + tolerance || p.y > h + tolerance) return false;
  if (isPath(element)) return element.points.some((a, index) => index > 0 && segmentDistance(p, element.points[index - 1], a) < tolerance + element.strokeWidth / 2);
  if (element.type === "ellipse") return Math.hypot((p.x - w / 2) / (w / 2 + tolerance), (p.y - h / 2) / (h / 2 + tolerance)) <= 1;
  if (element.type === "diamond") return Math.abs(p.x - w / 2) / (w / 2 + tolerance) + Math.abs(p.y - h / 2) / (h / 2 + tolerance) <= 1;
  return true;
}
export function selectionWithGroups(elements, ids) {
  const groups = new Set(elements.filter((item) => ids.includes(item.id) && item.groupId).map((item) => item.groupId));
  return elements.filter((item) => ids.includes(item.id) || groups.has(item.groupId)).map((item) => item.id);
}
export function resizeElements(elements, original, target) {
  const sx = target.width / (original.width || 1), sy = target.height / (original.height || 1);
  return elements.map((item) => ({ ...clone(item), x: target.x + (item.x - original.x) * sx,
    y: target.y + (item.y - original.y) * sy, width: item.width * sx, height: item.height * sy,
    points: item.points.map(([x, y]) => [x * sx, y * sy]) }));
}
export function normalizePath(element, absolutePoints) {
  const x = Math.min(...absolutePoints.map((point) => point[0]));
  const y = Math.min(...absolutePoints.map((point) => point[1]));
  return { ...element, x, y, width: Math.max(...absolutePoints.map((point) => point[0])) - x,
    height: Math.max(...absolutePoints.map((point) => point[1])) - y,
    points: absolutePoints.map(([px, py]) => [px - x, py - y]) };
}
export function pathData(element) {
  return element.points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
}
export function arrowHead(element) {
  const points = element.points;
  if (points.length < 2) return "";
  const end = points[points.length - 1], start = points[points.length - 2];
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const length = 10 + element.strokeWidth * 2;
  return `${end[0] - length * Math.cos(angle - .45)},${end[1] - length * Math.sin(angle - .45)} ${end[0]},${end[1]} ${end[0] - length * Math.cos(angle + .45)},${end[1] - length * Math.sin(angle + .45)}`;
}
export function textLines(element) {
  const padding = element.type === "note" ? 20 : 8;
  const maxLength = Math.max(1, Math.floor((element.width - padding * 2) / (element.fontSize * .55)));
  return element.text.split("\n").flatMap((line) => {
    const lines = [];
    let current = "";
    for (const word of line.split(" ")) {
      if (current && current.length + word.length + 1 > maxLength) { lines.push(current); current = ""; }
      let remaining = word;
      while (remaining.length > maxLength) {
        if (current) { lines.push(current); current = ""; }
        lines.push(remaining.slice(0, maxLength)); remaining = remaining.slice(maxLength);
      }
      current += (current ? " " : "") + remaining;
    }
    lines.push(current);
    return lines;
  });
}
export function fitText(element) {
  const lineHeight = element.fontSize * 1.4;
  const padding = element.type === "note" ? 40 : 16;
  return Math.max(element.type === "note" ? 100 : 36, textLines(element).length * lineHeight + padding);
}
