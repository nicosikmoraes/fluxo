import { describe, expect, it } from "vitest";
import { alignRoadmap } from "../src/features/roadmap/roadmapAlignment";
describe("Alinhamento preservando a estrutura", () => {
  it("nivela linhas, regulariza colunas e mantém o começo deslocado da ramificação", () => {
    const nodes = [{ id: 1, x: 10, y: 10 }, { id: 2, x: 350, y: 18 }, { id: 3, x: 696, y: 14 }, { id: 4, x: 358, y: 320 }, { id: 5, x: 704, y: 330 }];
    const result = alignRoadmap(nodes);
    expect(result.nodes).toEqual([{ id: 1, x: 10, y: 14 }, { id: 2, x: 346, y: 14 }, { id: 3, x: 682, y: 14 }, { id: 4, x: 346, y: 325 }, { id: 5, x: 682, y: 325 }]);
    expect(nodes[1].x).toBe(350);
  });
  it("preserva colunas vazias inclusive quando não há card algum nelas", () => {
    const result = alignRoadmap([{ id: 1, x: 0, y: 0 }, { id: 2, x: 350, y: 0 }, { id: 3, x: 1400, y: 300 }, { id: 4, x: 1750, y: 300 }]);
    expect(result.nodes.map((node) => node.x)).toEqual([0, 336, 1344, 1680]);
  });
  it("não mistura duas linhas por uma cadeia de pequenos desvios", () => {
    const result = alignRoadmap([{ id: 1, x: 0, y: 0 }, { id: 2, x: 350, y: 50 }, { id: 3, x: 700, y: 100 }]);
    expect(result.rows).toBe(2);
    expect(result.nodes.map((node) => node.y)).toEqual([25, 25, 273]);
  });
  it("não coloca dois cards da mesma linha na mesma coluna e não cria sobreposição", () => {
    const result = alignRoadmap([{ id: 1, x: 0, y: 0 }, { id: 2, x: 40, y: 5 }, { id: 3, x: 0, y: 300 }]);
    expect(result.nodes[1].x - result.nodes[0].x).toBe(336);
    expect(result.nodes[2].x).toBe(0);
  });
  it("acompanha o card final com o portal, preserva os dados e evita cards no destino", () => {
    const portals = [{ id: "p", x: 655, y: 80, label: "", sources: [2] }];
    const result = alignRoadmap([{ id: 1, x: 0, y: 0 }, { id: 2, x: 350, y: 12 }, { id: 3, x: 700, y: 0 }], portals);
    expect(result.portals[0]).toEqual({ id: "p", x: 977, y: 44 });
    expect(portals[0].y).toBe(80);
  });
  it("escolhe a linha mais próxima em portais compartilhados e mantém portais soltos", () => {
    const result = alignRoadmap([{ id: 1, x: 0, y: 0 }, { id: 2, x: 350, y: 0 }, { id: 3, x: 350, y: 300 }], [{ id: "p", x: 680, y: 340, sources: [2, 3] }, { id: "loose", x: 20, y: 700, sources: [] }]);
    expect(result.portals[0].y).toBe(344);
    expect(result.portals[1]).toEqual({ id: "loose", x: 20, y: 700 });
  });
  it("é estável ao repetir o alinhamento e trata mapa vazio", () => {
    const first = alignRoadmap([{ id: 1, x: 0, y: 0 }, { id: 2, x: 355, y: 20 }, { id: 3, x: 1065, y: 320 }]);
    expect(alignRoadmap(first.nodes).nodes).toEqual(first.nodes);
    expect(alignRoadmap([]).nodes).toEqual([]);
  });
  it("recusa posições inválidas e um resultado fora do limite do quadro", () => {
    expect(() => alignRoadmap([{ id: 1, x: NaN, y: 0 }])).toThrow();
    expect(() => alignRoadmap([{ id: 1, x: 999990, y: 0 }, { id: 2, x: 1e6, y: 0 }])).toThrow();
  });
});
