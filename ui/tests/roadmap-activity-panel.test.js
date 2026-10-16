import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { reactive, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("../src/state/workspace", () => ({
  state: reactive({ tasks: [], projects: [], roadmaps: [], saving: 0, loading: false, error: "", toast: null }),
  load: vi.fn(),
  mutate: vi.fn(),
  notify: vi.fn(),
  label: (status) => ({ pending: "Pendente", doing: "Em andamento", done: "Concluída" })[status],
  date: () => "15 out.",
  statuses: [{ id: "pending", label: "Pendente" }, { id: "doing", label: "Em andamento" }, { id: "done", label: "Concluída" }]
}));
import { state, mutate } from "../src/state/workspace";
import App from "../src/App.vue";
import TaskPanel from "../src/features/tasks/TaskPanel.vue";
let wrapper;
const focused = () => wrapper.find(".task-drawer.activity-only");
const selected = () => state.tasks[0].activities.find((a) => a.id === 2);
async function openRoadmap() {
  wrapper = mount(App, { attachTo: document.body });
  await flushPromises();
  await wrapper.find(".sidebar-projects .project-link").trigger("click");
  await wrapper.findAll('[role="tab"]')[1].trigger("click");
}
async function openActivity(selector = ".map-node-title") {
  await openRoadmap();
  await wrapper.findAll(".map-node")[1].find(selector).trigger("click", { detail: 0 });
  await flushPromises();
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  state.saving = 0;
  state.loading = false;
  state.toast = null;
  state.projects = [{ id: 7, title: "Meu projeto", cover: "desk" }];
  state.tasks = [{ id: 10, project_id: 7, title: "Construir produto", description: "Descrição completa da task", status: "pending", completed_count: 0, blocked_count: 0, comments_count: 1, created_at: "2026-10-15T10:00:00Z", activities: [
    { id: 1, title: "Outra atividade", status: "pending", blocked: false, comments: [] },
    { id: 2, title: "Atividade escolhida", status: "pending", blocked: false, comments: [{ id: 20, body: "Comentário da atividade escolhida", created_at: "2026-10-15T10:00:00Z", updated_at: "2026-10-15T10:00:00Z" }] },
    { id: 3, title: "Última atividade", status: "pending", blocked: false, comments: [] }
  ] }];
  state.roadmaps = [{ id: 1, project_id: 7, title: "Meu roadmap", nodes: [1, 2, 3].map((id, i) => ({ id: id + 4, activity_id: id, x: i * 350, y: 20 })), edges: [] }];
  mutate.mockImplementation(async (url, method, data) => {
    const activity = selected();
    if (url === "/activities/2" && method === "PATCH") Object.assign(activity, data);
    if (url === "/activities/2" && method === "DELETE") state.tasks[0].activities = state.tasks[0].activities.filter((a) => a.id !== 2);
    if (url === "/activities/2/comments") activity.comments.push({ id: 21, body: data.body, created_at: "2026-10-15T11:00:00Z", updated_at: "2026-10-15T11:00:00Z" });
    if (url === "/comments/20" && method === "PATCH") activity.comments[0].body = data.body;
    if (url === "/comments/20" && method === "DELETE") activity.comments = activity.comments.filter((c) => c.id !== 20);
    state.tasks[0].completed_count = state.tasks[0].activities.filter((a) => a.status === "done").length;
    return { id: 2 };
  });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});
describe("Atividade individual ao abrir um card do roadmap", () => {
  it.each([".map-node-title", ".map-node-info button"])("abre somente o item clicado por %s, com seus comentários disponíveis", async (selector) => {
    await openActivity(selector);
    expect(focused().attributes("aria-label")).toBe("Atividade: Atividade escolhida");
    expect(focused().findAll(".activity-card")).toHaveLength(1);
    expect(focused().find("h1").text()).toBe("Atividade escolhida");
    expect(focused().text()).not.toContain("Outra atividade");
    expect(focused().text()).not.toContain("Última atividade");
    expect(focused().text()).not.toContain("Descrição completa da task");
    expect(focused().find(".comment-body").text()).toBe("Comentário da atividade escolhida");
    expect(focused().findAll(".drag-handle, .add-activity, .task-delivery, .progress-track")).toHaveLength(0);
    expect(focused().find('[aria-label="Editar task"]').exists()).toBe(false);
  });
  it("conclui, reabre e muda o status somente da atividade selecionada, atualizando o card", async () => {
    await openActivity();
    await focused().find('[aria-label="Concluir atividade"]').trigger("click");
    await flushPromises();
    expect(mutate).toHaveBeenLastCalledWith("/activities/2", "PATCH", { status: "done" });
    expect(wrapper.findAll(".map-node")[1].classes()).toContain("completed");
    expect(state.tasks[0].activities[0].status).toBe("pending");
    expect(state.tasks[0].activities[2].status).toBe("pending");
    await focused().find('[aria-label="Reabrir atividade"]').trigger("click");
    await flushPromises();
    expect(selected().status).toBe("pending");
    await focused().find(".status-select").setValue("doing");
    await flushPromises();
    expect(selected().status).toBe("doing");
    expect(focused().findAll(".activity-card")).toHaveLength(1);
  });
  it("edita o título da atividade e reflete a mudança no roadmap", async () => {
    await openActivity();
    await focused().find('[aria-label="Editar atividade"]').trigger("click");
    await wrapper.find(".modal input").setValue("Título revisado");
    await wrapper.find(".modal form").trigger("submit");
    await flushPromises();
    expect(mutate).toHaveBeenCalledWith("/activities/2", "PATCH", { title: "Título revisado" });
    expect(focused().find("h1").text()).toBe("Título revisado");
    expect(wrapper.findAll(".map-node-title")[1].text()).toBe("Título revisado");
    expect(state.tasks[0].title).toBe("Construir produto");
  });
  it("permite registrar, editar e remover bloqueios da atividade", async () => {
    await openActivity();
    await focused().find(".mini-action").trigger("click");
    await wrapper.find(".modal input").setValue("Mariana");
    await wrapper.find(".modal textarea").setValue("Liberar acesso");
    await wrapper.find(".modal form").trigger("submit");
    await flushPromises();
    expect(focused().find(".blocked-notice").text()).toContain("Aguardando Mariana terminar");
    expect(focused().find(".activity-check").attributes("disabled")).toBeDefined();
    expect(focused().find(".status-select").attributes("disabled")).toBeDefined();
    await focused().find(".mini-action").trigger("click");
    await wrapper.find(".modal input").setValue("João");
    await wrapper.find(".modal form").trigger("submit");
    await flushPromises();
    expect(selected().blocking_person).toBe("João");
    await focused().find(".blocked-notice .text-btn").trigger("click");
    await flushPromises();
    expect(selected().blocked).toBe(false);
  });
  it("adiciona, edita e exclui comentários sem navegar pela lista de atividades", async () => {
    await openActivity();
    await focused().find(".comment-form textarea").setValue("Próximo detalhe");
    await focused().find(".comment-form").trigger("submit");
    await flushPromises();
    expect(mutate).toHaveBeenCalledWith("/activities/2/comments", "POST", { body: "Próximo detalhe" });
    await focused().find('[aria-label="Editar comentário"]').trigger("click");
    await focused().find(".comment-content textarea").setValue("Comentário revisado");
    await focused().find(".comment-content form").trigger("submit");
    await flushPromises();
    expect(focused().find(".comment-body").text()).toBe("Comentário revisado");
    await focused().find('[aria-label="Excluir comentário"]').trigger("click");
    await wrapper.find(".modal .danger").trigger("click");
    await flushPromises();
    expect(focused().findAll(".comment")).toHaveLength(1);
    expect(focused().find(".comment-body").text()).toBe("Próximo detalhe");
  });
  it("fecha o painel ao excluir a atividade e preserva as demais", async () => {
    await openActivity();
    await focused().find('[aria-label="Excluir atividade"]').trigger("click");
    await wrapper.find(".modal .danger").trigger("click");
    await flushPromises();
    expect(focused().exists()).toBe(false);
    expect(state.tasks[0].activities.map((a) => a.id)).toEqual([1, 3]);
    expect(wrapper.findAll(".map-node")).toHaveLength(2);
  });
  it("mantém o painel e o status quando uma operação é recusada", async () => {
    await openActivity();
    mutate.mockResolvedValueOnce(null);
    await focused().find(".activity-check").trigger("click");
    await flushPromises();
    expect(focused().exists()).toBe(true);
    expect(selected().status).toBe("pending");
    state.saving = 1;
    await nextTick();
    expect(focused().find(".activity-check").attributes("disabled")).toBeDefined();
    await focused().find(".comment-form textarea").setValue("Aguardar");
    await focused().find(".comment-form").trigger("submit");
    expect(mutate).toHaveBeenCalledTimes(1);
  });
  it("abre outra atividade depois de fechar e mantém a task completa ao abrir pelo quadro", async () => {
    await openActivity();
    await focused().find('[aria-label="Fechar atividade"]').trigger("click");
    await wrapper.findAll(".map-node-title")[2].trigger("click", { detail: 0 });
    await flushPromises();
    expect(focused().find("h1").text()).toBe("Última atividade");
    expect(focused().findAll(".activity-card")).toHaveLength(1);
    await focused().find('[aria-label="Fechar atividade"]').trigger("click");
    await wrapper.findAll('[role="tab"]')[0].trigger("click");
    await wrapper.find(".task-card").trigger("click");
    expect(wrapper.find(".task-drawer").classes()).not.toContain("activity-only");
    expect(wrapper.findAll(".activity-card")).toHaveLength(3);
    expect(wrapper.find(".add-activity").exists()).toBe(true);
    expect(wrapper.find('[aria-label="Editar task"]').exists()).toBe(true);
  });
  it("mantém o painel completo quando recebe apenas a indicação de atividade inicial", async () => {
    wrapper = mount(TaskPanel, { props: { taskId: 10, initialActivityId: 2 }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.findAll(".activity-card")).toHaveLength(3);
    expect(wrapper.findAll(".comments-area")).toHaveLength(1);
    expect(wrapper.find(".activity-card.expanded").attributes("data-id")).toBe("2");
  });
});
