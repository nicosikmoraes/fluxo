import { theme } from "../appearance/theme";

const graphitePalette = {
  "#454157": "#e0d6eb", "#6d62cf": "#b59ae7", "#4c78cc": "#94b6eb",
  "#3c907c": "#8bc7b5", "#c26a65": "#e6aaa4", "#b48a36": "#d9bf84",
  "#eee9fb": "#342b43", "#eee8fa": "#342b43", "#e5efff": "#25364b",
  "#e2f2e9": "#253d32", "#fbe5dd": "#482f2b", "#fff1b8": "#4a3b24",
  "#a69bb6": "#b7a9c9", "#9681c0": "#bca4de", "#809ac7": "#a7bfdc", "#78a28a": "#a6cdb3",
};

export function displayColor(value, kind = "stroke") {
  if (theme.value !== "graphite" || !value || value === "transparent") return value;
  const color = value.toLowerCase();
  if (graphitePalette[color]) return graphitePalette[color];
  if (!/^#[0-9a-f]{6}$/.test(color)) return value;
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const brightness = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  if (kind === "stroke" && brightness < 150) return "#" + channels.map((channel) => Math.round(channel * .3 + 178).toString(16).padStart(2, "0")).join("");
  if (kind === "fill" && brightness > 150) return "#" + channels.map((channel) => Math.round(channel * .22).toString(16).padStart(2, "0")).join("");
  return value;
}
