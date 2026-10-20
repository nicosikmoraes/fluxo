import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import FluxoWhiteboard from "../src/features/whiteboard/FluxoWhiteboard.vue";
import App from "../src/App.vue";
import { useWhiteboard } from "../src/features/whiteboard/useWhiteboard";
import { apiRequest, auth } from "../src/features/auth/auth";
import { bounds, createElement, hitTest, normalizePath, resizeElements, selectionWithGroups } from "../src/features/whiteboard/whiteboard";

let wrapper, board;
async function open() {
  wrapper = mount(defineComponent({ setup() {
    board = useWhiteboard();
    return () => h(FluxoWhiteboard, { board });
  } }), { attachTo: document.body });
  await vi.waitFor(() => expect(board.state.ready).toBe(true), { timeout: 5000 });
}
const click = (label) => wrapper.find(`[aria-label="${label}"]`).trigger("click");
async function draw(label, start, end) {
  await click(label);
  const canvas = wrapper.find(".sketch-viewport");
  await canvas.trigger("pointerdown", { clientX: start[0], clientY: start[1], pointerId: 1, button: 0 });
  await canvas.trigger("pointermove", { clientX: end[0], clientY: end[1], pointerId: 1 });
  await canvas.trigger("pointerup", { clientX: end[0], clientY: end[1], pointerId: 1 });
}
async function key(value, options = {}) { window.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options })); await nextTick(); }
beforeEach(async () => {
  sessionStorage.clear();
  const current = await apiRequest("/whiteboard");
  await apiRequest("/whiteboard", "PUT", { elements: [], version: current.version });
});
afterEach(async () => {
  wrapper?.unmount();
  if (board?.state.dirty && !board.state.conflict) await board.save();
  document.body.innerHTML = "";
});

describe("Quadro de ideias", () => {
  it("abre pela navegação global e preserva o quadro ao alternar entre páginas", async () => {
    board = null;
    window.history.replaceState({}, "", "/ui/");
    wrapper = mount(App, { attachTo: document.body });
    await wrapper.findAll("nav button").find((button) => button.text().includes("Quadro de ideias")).trigger("click");
    await vi.waitFor(() => expect(wrapper.find(".sketch-empty").exists()).toBe(true), { timeout: 5000 });
    expect(wrapper.find(".hero").exists()).toBe(false);
    expect(window.location.search).toBe("?view=whiteboard");
    await wrapper.find(".sketch-start-note").trigger("click");
    await wrapper.find("textarea.sketch-text-editor").setValue("Meu espaço de ideias");
    await wrapper.find("textarea.sketch-text-editor").trigger("blur");
    await vi.waitFor(async () => expect((await apiRequest("/whiteboard")).elements[0]?.text).toBe("Meu espaço de ideias"), { timeout: 3000 });
    await wrapper.findAll("nav button").find((button) => button.text().includes("Projetos")).trigger("click");
    expect(wrapper.find(".sketch-page").exists()).toBe(false);
    await wrapper.findAll("nav button").find((button) => button.text().includes("Quadro de ideias")).trigger("click");
    await vi.waitFor(() => expect(wrapper.findAll(".sketch-element")).toHaveLength(1), { timeout: 5000 });
    window.history.replaceState({}, "", "/ui/");
  });

  it("desenha formas, setas e traços, escreve uma nota e reabre o conteúdo salvo", async () => {
    await open();
    await draw("Retângulo", [300, 180], [460, 290]);
    await draw("Seta", [500, 250], [690, 160]);
    await draw("Desenhar", [550, 350], [620, 410]);
    await click("Nota adesiva");
    await wrapper.find(".sketch-viewport").trigger("pointerdown", { clientX: 720, clientY: 320, pointerId: 1, button: 0 });
    await wrapper.find(".sketch-viewport").trigger("pointerup", { clientX: 720, clientY: 320, pointerId: 1 });
    await wrapper.find("textarea").setValue("Organizar minhas ideias\nEscolher o próximo passo");
    await wrapper.find("textarea").trigger("blur");
    await board.save();

    const stored = await apiRequest("/whiteboard");
    expect(stored.elements.map((item) => item.type)).toEqual(["rectangle", "arrow", "pen", "note"]);
    expect(stored.elements[1].points).toEqual([[0, 90], [190, 0]]);
    expect(stored.elements[3].text).toContain("Escolher o próximo passo");
    wrapper.unmount(); await open();
    expect(wrapper.findAll(".sketch-element")).toHaveLength(4);
    expect(wrapper.findAll(".sketch-artwork tspan").map((line) => line.text()).join(" ")).toContain("Organizar minhas ideias");
    expect(board.state.dirty).toBe(false);
  });

  it("agrupa, duplica, desfaz, refaz e exclui mantendo o salvamento consistente", async () => {
    await open();
    await draw("Retângulo", [300, 180], [420, 280]);
    await draw("Elipse", [500, 180], [600, 280]);
    await key("a", { ctrlKey: true });
    await click("Agrupar seleção");
    expect(board.state.elements[0].groupId).toBeTruthy();
    expect(board.state.elements[1].groupId).toBe(board.state.elements[0].groupId);
    await click("Duplicar seleção");
    expect(wrapper.findAll(".sketch-element")).toHaveLength(4);
    expect(board.state.elements[2].groupId).not.toBe(board.state.elements[0].groupId);
    await click("Desfazer"); expect(wrapper.findAll(".sketch-element")).toHaveLength(2);
    await click("Refazer"); expect(wrapper.findAll(".sketch-element")).toHaveLength(4);
    await click("Excluir seleção"); expect(wrapper.findAll(".sketch-element")).toHaveLength(2);
    await board.save();
    expect((await apiRequest("/whiteboard")).elements).toHaveLength(2);
  });

  it("redimensiona uma forma e mantém o deslocamento correto com zoom", async () => {
    await open();
    await draw("Retângulo", [300, 180], [460, 290]);
    const canvas = wrapper.find(".sketch-viewport");
    await wrapper.find('[data-handle="se"]').trigger("pointerdown", { clientX: 460, clientY: 290, pointerId: 1, button: 0 });
    await canvas.trigger("pointermove", { clientX: 540, clientY: 350, pointerId: 1 });
    await canvas.trigger("pointerup", { clientX: 540, clientY: 350, pointerId: 1 });
    expect([board.state.elements[0].width, board.state.elements[0].height]).toEqual([240, 170]);
    await click("Aumentar zoom");
    expect(wrapper.find(".sketch-zoom-value").text()).toBe("120%");
    await canvas.trigger("pointerdown", { clientX: 404, clientY: 253, pointerId: 1, button: 0 });
    await canvas.trigger("pointermove", { clientX: 464, clientY: 277, pointerId: 1 });
    await canvas.trigger("pointerup", { clientX: 464, clientY: 277, pointerId: 1 });
    expect(board.state.elements[0].x).toBeCloseTo(290);
    expect(board.state.elements[0].y).toBeCloseTo(150);
    await board.save();
  });

  it("salva automaticamente e não grava uma forma enquanto ela está sendo desenhada", async () => {
    await open();
    await draw("Retângulo", [300, 180], [460, 290]);
    await wrapper.find(".sketch-viewport").trigger("pointerdown", { clientX: 380, clientY: 230, pointerId: 1, button: 0, shiftKey: true });
    await wrapper.find(".sketch-viewport").trigger("pointerup", { clientX: 380, clientY: 230, pointerId: 1 });
    expect(wrapper.find(".sketch-inspector header").text()).toBe("SEU TRAÇO");
    await vi.waitFor(async () => expect((await apiRequest("/whiteboard")).elements).toHaveLength(1), { timeout: 5000 });
    await draw("Elipse", [500, 180], [600, 280]);
    await click("Losango");
    const canvas = wrapper.find(".sketch-viewport");
    await canvas.trigger("pointerdown", { clientX: 700, clientY: 300, pointerId: 1, button: 0 });
    await canvas.trigger("pointermove", { clientX: 800, clientY: 400, pointerId: 1 });
    await board.save();
    expect((await apiRequest("/whiteboard")).elements).toHaveLength(1);
    await key("Escape");
    await board.save();
    expect((await apiRequest("/whiteboard")).elements.map((item) => item.type)).toEqual(["rectangle", "ellipse"]);
    expect(wrapper.findAll(".sketch-element")).toHaveLength(2);
  });

  it("preserva o rascunho e mostra recuperação quando outra aba salva primeiro", async () => {
    await open();
    await apiRequest("/whiteboard", "PUT", { elements: [createElement("note", 10, 20)], version: board.state.version });
    await draw("Retângulo", [300, 180], [460, 290]);
    expect(wrapper.find(".sketch-inspector").text()).toContain("1 elemento");
    await board.save();
    expect(wrapper.find('[role="alert"]').text()).toContain("outra aba");
    const draft = JSON.parse(sessionStorage.getItem("fluxo:whiteboard-draft:" + auth.user.id + ":global"));
    expect(draft.elements[0].type).toBe("rectangle");
    expect((await apiRequest("/whiteboard")).elements[0].type).toBe("note");
    wrapper.unmount(); await open();
    expect(board.state.conflict).toBe(true);
    expect(board.state.elements[0].type).toBe("rectangle");
    await wrapper.find(".sketch-error").findAll("button")[1].trigger("click");
    await wrapper.find(".modal-actions .primary").trigger("click");
    await vi.waitFor(() => expect(board.state.elements[0].type).toBe("note"), { timeout: 5000 });
    expect(board.state.dirty).toBe(false);
    expect(sessionStorage.getItem("fluxo:whiteboard-draft:" + auth.user.id + ":global")).toBeNull();
  });

  it("trata texto como conteúdo ao escrever dentro de uma forma", async () => {
    await open();
    await draw("Retângulo", [300, 180], [460, 290]);
    expect(wrapper.find(".sketch-inspector").text()).toContain("1 elemento");
    expect(board.state.elements.map((item) => item.type)).toEqual(["rectangle"]);
    await click("Escrever no elemento");
    await wrapper.find("textarea").setValue('<img src=x onerror="alert(1)">');
    await wrapper.find("textarea").trigger("blur");
    expect(wrapper.find(".sketch-artwork img").exists()).toBe(false);
    expect(board.state.elements[0].text).toContain("<img");
    expect(wrapper.find(".sketch-artwork").html()).toContain("&lt;");
  });

});

describe("geometria e seleção", () => {
  it("seleciona o traço real de uma linha em vez de toda a caixa ao redor", () => {
    const arrow = normalizePath(createElement("arrow", 0, 0), [[100, 200], [300, 100]]);
    expect(hitTest(arrow, { x: 200, y: 150 })).toBe(true);
    expect(hitTest(arrow, { x: 110, y: 110 })).toBe(false);
  });
  it("redimensiona pontos de desenho e mantém elementos agrupados na seleção", () => {
    const pen = { ...normalizePath(createElement("pen", 0, 0), [[20, 30], [50, 60], [80, 30]]), groupId: "grupo" };
    const note = { ...createElement("note", 100, 30), groupId: "grupo" };
    expect(selectionWithGroups([pen, note], [pen.id])).toEqual([pen.id, note.id]);
    const [resized] = resizeElements([pen], bounds([pen]), { x: 40, y: 60, width: 120, height: 60 });
    expect(resized.points).toEqual([[0, 0], [60, 60], [120, 0]]);
    expect([resized.x, resized.y]).toEqual([40, 60]);
  });
});
