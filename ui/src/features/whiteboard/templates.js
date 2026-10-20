import { createElement, uid } from "./whiteboard";

function shape(type, x, y, width, height, text, fill, stroke = "#454157") {
  const element = createElement(type, x, y, { stroke, fill, fontSize: 17, strokeWidth: 2 });
  return { ...element, width, height, text, groupId: null };
}

function arrow(x, y, endX, endY) {
  const left = Math.min(x, endX), top = Math.min(y, endY);
  return { ...createElement("arrow", left, top, { stroke: "#a69bb6", strokeWidth: 2 }),
    width: Math.abs(endX - x), height: Math.abs(endY - y), points: [[x - left, y - top], [endX - left, endY - top]] };
}

export const boardTemplates = [
  { id: "brainstorm", name: "Chuva de ideias", description: "Abra uma ideia central e conecte possibilidades.", accent: "#eee8fa", create: (x, y) => [
    shape("ellipse", x + 270, y + 150, 210, 105, "IDEIA CENTRAL", "#eee8fa", "#9681c0"),
    shape("note", x + 10, y + 25, 205, 145, "Possibilidade 1", "#fff1b8", "#b48a36"),
    shape("note", x + 530, y + 15, 205, 145, "Possibilidade 2", "#e2f2e9", "#3c907c"),
    shape("note", x + 20, y + 265, 205, 145, "Possibilidade 3", "#e5efff", "#4c78cc"),
    shape("note", x + 525, y + 270, 205, 145, "Próximo passo", "#fbe5dd", "#c26a65"),
    arrow(x + 200, y + 145, x + 290, y + 190), arrow(x + 530, y + 130, x + 465, y + 185),
    arrow(x + 210, y + 305, x + 290, y + 235), arrow(x + 530, y + 310, x + 465, y + 235),
  ] },
  { id: "weekly", name: "Planejamento semanal", description: "Distribua prioridades pelos dias da semana.", accent: "#e5efff", create: (x, y) => {
    const days = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA"];
    return days.flatMap((day, index) => [
      shape("rectangle", x + index * 158, y, 140, 56, day, "#e5efff", "#809ac7"),
      shape("note", x + index * 158, y + 76, 140, 120, "Prioridade do dia", index % 2 ? "#e2f2e9" : "#fff1b8", index % 2 ? "#78a28a" : "#b48a36"),
    ]);
  } },
  { id: "flow", name: "Fluxo de processo", description: "Mapeie etapas e decisões de um processo.", accent: "#e2f2e9", create: (x, y) => [
    shape("ellipse", x, y + 100, 140, 70, "COMEÇO", "#e2f2e9", "#3c907c"),
    shape("rectangle", x + 215, y + 100, 165, 70, "Etapa 1", "#e5efff", "#4c78cc"),
    shape("diamond", x + 460, y + 90, 145, 90, "Decisão?", "#fff1b8", "#b48a36"),
    shape("rectangle", x + 690, y + 20, 165, 70, "Caminho A", "#eee8fa", "#9681c0"),
    shape("rectangle", x + 690, y + 220, 165, 70, "Caminho B", "#fbe5dd", "#c26a65"),
    shape("ellipse", x + 950, y + 100, 140, 70, "FIM", "#e2f2e9", "#3c907c"),
    arrow(x + 140, y + 135, x + 215, y + 135), arrow(x + 380, y + 135, x + 460, y + 135),
    arrow(x + 605, y + 125, x + 690, y + 55), arrow(x + 605, y + 145, x + 690, y + 255),
    arrow(x + 855, y + 55, x + 950, y + 125), arrow(x + 855, y + 255, x + 950, y + 145),
  ] },
  { id: "retro", name: "Retrospectiva", description: "Reflita sobre o que funcionou e o que vem a seguir.", accent: "#fbe5dd", create: (x, y) => [
    shape("rectangle", x, y, 230, 58, "O QUE FUNCIONOU", "#e2f2e9", "#3c907c"),
    shape("rectangle", x + 270, y, 230, 58, "O QUE PODE MELHORAR", "#fff1b8", "#b48a36"),
    shape("rectangle", x + 540, y, 230, 58, "PRÓXIMAS AÇÕES", "#e5efff", "#4c78cc"),
    shape("note", x + 10, y + 82, 210, 145, "Uma coisa que deu certo...", "#e2f2e9", "#3c907c"),
    shape("note", x + 280, y + 82, 210, 145, "Uma coisa para ajustar...", "#fff1b8", "#b48a36"),
    shape("note", x + 550, y + 82, 210, 145, "Uma ação para a próxima vez...", "#e5efff", "#4c78cc"),
  ] },
];

export function createBoardTemplate(templateId, x, y) {
  const template = boardTemplates.find((item) => item.id === templateId);
  if (!template) return [];
  return template.create(x, y).map((item) => ({ ...item, id: uid() }));
}
