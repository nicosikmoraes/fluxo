import { describe, it, expect } from "vitest";
import { selectionBounds, intersectingCards, translateCards, layoutMovePayload } from "../src/features/roadmap/roadmapSelection";
describe("Seleção e deslocamento dos cards", () => {
  it("seleciona cards parcialmente incluídos ao arrastar em qualquer direção", () => {
    const bounds = selectionBounds({ x: 600, y: 350 }, { x: 200, y: 150 });
    expect(bounds).toEqual({ x: 200, y: 150, width: 400, height: 200 });
    expect(intersectingCards([{ id: 1, x: 0, y: 0 }, { id: 2, x: 500, y: 300 }, { id: 3, x: 601, y: 300 }, { id: 4, x: 0, y: 400 }], bounds)).toEqual([1, 2]);
  });
  it("move o grupo pelo mesmo deslocamento, respeitando as bordas sem comprimir os espaços", () => {
    const nodes = [{ id: 1, x: 20, y: 80 }, { id: 2, x: 360, y: 220 }];
    expect(translateCards(nodes, -200, -100)).toEqual([{ id: 1, x: 0, y: 0 }, { id: 2, x: 340, y: 140 }]);
    expect(nodes[0]).toEqual({ id: 1, x: 20, y: 80 });
    expect(translateCards([{ id: 1, x: 999900, y: 999950 }, { id: 2, x: 1e6, y: 1e6 }], 50, 70)).toEqual([{ id: 1, x: 999900, y: 999950 }, { id: 2, x: 1e6, y: 1e6 }]);
  });
  it("mantém os cards não selecionados e inclui as posições anteriores para salvar sem conflitos", () => {
    expect(layoutMovePayload([{ id: 1, x: 20, y: 30 }, { id: 2, x: 400, y: 40 }, { id: 3, x: 900, y: 50 }], [{ id: 1, x: 50, y: 90 }, { id: 2, x: 430, y: 100 }])).toEqual({ nodes: [{ id: 1, x: 50, y: 90, previous_x: 20, previous_y: 30 }, { id: 2, x: 430, y: 100, previous_x: 400, previous_y: 40 }, { id: 3, x: 900, y: 50, previous_x: 900, previous_y: 50 }] });
  });
});
