import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
const html = readFileSync("../app/public/recuperar-portais.html", "utf8");
const script = html.split("<script>")[1].split("<\/script>")[0];
const portal = { id: "old-portal", label: "Entrega", x: 500, y: 80, sources: [5, 999] };
const payload = { format: "fluxo-portals-v1", roadmaps: [{ id: 1, portals: [portal] }] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function page(port = 8787, data) {
  const window = new Window({ url: "http://127.0.0.1:" + port + "/recuperar-portais.html" + (data ? "#" + encodeURIComponent(JSON.stringify(data)) : ""), settings: { enableJavaScriptEvaluation: true } });
  window.document.write(html.replace(/<script>[\s\S]*<\/script>/, ""));
  return { window };
}
describe("Recuperação dos portais do navegador antigo", () => {
  it("exporta apenas portais e preserva a cópia original no navegador", () => {
    const dom = page();
    const { window } = dom;
    const original = JSON.stringify([portal]);
    window.localStorage.setItem("fluxo:roadmap-portals:1", original);
    window.localStorage.setItem("fluxo:roadmap-portals:2", "invalid");
    window.localStorage.setItem("outro-dado", "não exportar");
    window.eval(script);
    expect(window.document.querySelector("#status").textContent).toContain("1 portais encontrados");
    const data = JSON.parse(window.document.querySelector("#backup").value);
    expect(data.roadmaps).toEqual([{ id: 1, portals: [portal] }]);
    expect(data).not.toHaveProperty("outro-dado");
    expect(window.localStorage.getItem("fluxo:roadmap-portals:1")).toBe(original);
    dom.window.close();
  });
  it("exige entrada na conta e não importa automaticamente", async () => {
    const dom = page(8788, payload);
    dom.window.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ user: null, csrf_token: "token" }) }));
    dom.window.eval(script);
    await settle();
    expect(dom.window.document.querySelector("#status").textContent).toContain("Entre com sua conta");
    expect(dom.window.fetch).toHaveBeenCalledTimes(1);
    dom.window.close();
  });
  it("recupera na conta mantendo portais existentes, filtrando conexões órfãs e sem duplicar ao repetir", async () => {
    const existing = { id: "new-portal", label: "Novo", x: 300, y: 400, sources: [] };
    let stored = [existing], version = 0;
    const dom = page(8788, payload);
    const local = { id: "new-origin-portal", label: "Criado no preview", x: 800, y: 200, sources: [5] };
    dom.window.localStorage.setItem("fluxo:roadmap-portals:1", JSON.stringify([local]));
    const requests = [];
    dom.window.fetch = vi.fn(async (url, options) => {
      let data;
      if (url.endsWith("/session")) data = { user: { id: 1, name: "Nicolas" }, csrf_token: "token" };
      else if (url.endsWith("/workspace")) data = { roadmaps: [{ id: 1, nodes: [{ id: 5 }], portals: stored, portals_version: version }] };
      else {
        const body = JSON.parse(options.body);
        requests.push({ url, ...options, body });
        stored = body.portals;
        version++;
        data = { portals: stored, portals_version: version };
      }
      return { ok: true, json: async () => data };
    });
    dom.window.eval(script);
    await settle();
    expect(requests).toHaveLength(0);
    expect(dom.window.document.querySelector("#status").textContent).toContain("portais preparados");
    dom.window.document.querySelector("#actions button").click();
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/api/roadmaps/1/portals");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers["X-CSRF-TOKEN"]).toBe("token");
    expect(stored).toEqual([existing, { ...portal, sources: [5] }, local]);
    expect(dom.window.document.querySelector("#status").textContent).toContain("recuperados e salvos");
    const retry = page(8788, payload);
    retry.window.fetch = dom.window.fetch;
    dom.window.close();
    retry.window.eval(script);
    await settle();
    retry.window.document.querySelector("#actions button").click();
    await settle();
    expect(stored).toHaveLength(3);
    retry.window.close();
  });
});
