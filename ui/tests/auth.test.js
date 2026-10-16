import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { randomUUID } from "node:crypto";
import Root from "../src/Root.vue";
import { auth, apiRequest, restoreSession, signOut } from "../src/features/auth/auth";
import { state, refresh } from "../src/state/workspace";
let wrapper;
const wait = (fn) => vi.waitFor(fn, { timeout: 8e3, interval: 30 });
async function open() {
  wrapper = mount(Root, { attachTo: document.body });
  await wait(() => expect(wrapper.find(".auth-page").exists()).toBe(true));
}
async function register(email, name) {
  await wrapper.findAll(".auth-tabs button")[1].trigger("click");
  await wrapper.find("#auth-name").setValue(name);
  await wrapper.find("#auth-email").setValue(email);
  await wrapper.find("#auth-password").setValue("minha senha segura 123");
  await wrapper.find("#auth-confirm").setValue("minha senha segura 123");
  await wrapper.find(".auth-card form").trigger("submit");
  await wait(() => expect(wrapper.find(".app-shell").exists()).toBe(true));
  await wait(() => expect(state.loading).toBe(false));
}
beforeEach(async () => {
  await restoreSession();
  if (auth.user) await signOut();
  auth.loading = true;
  auth.error = "";
  auth.message = "";
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});
describe("Acesso ao Fluxo", () => {
  it("mostra o banner imersivo e o login antes de abrir o espaço privado", async () => {
    await open();
    expect(wrapper.find(".auth-backdrop").attributes("src")).toBe("/ui/login-banner.png");
    expect(wrapper.find(".app-shell").exists()).toBe(false);
    expect(wrapper.find("#auth-name").exists()).toBe(false);
    expect(wrapper.find("#auth-confirm").exists()).toBe(false);
    await wrapper.find("#auth-password").setValue("segredo");
    await wrapper.find('[aria-label="Mostrar senha"]').trigger("click");
    expect(wrapper.find("#auth-password").attributes("type")).toBe("text");
    await wrapper.find(".auth-options button").trigger("click");
    expect(wrapper.find("#auth-password").exists()).toBe(false);
    expect(wrapper.find(".auth-submit").text()).toContain("Enviar instruções");
  });
  it("cria contas, sai e impede que a próxima conta veja as tasks da anterior", async () => {
    await open();
    const email = randomUUID() + "@example.com";
    await register(email, "Minha primeira conta");
    await apiRequest("/tasks", "POST", { title: "Minha task particular" });
    await refresh();
    await wait(() => expect(wrapper.text()).toContain("Minha task particular"));
    await wrapper.find(".account-exit").trigger("click");
    await wait(() => expect(wrapper.find(".auth-page").exists()).toBe(true));
    expect(state.tasks).toEqual([]);
    await register(randomUUID() + "@example.com", "Minha segunda conta");
    expect(wrapper.text()).not.toContain("Minha task particular");
    expect(state.tasks).toEqual([]);
    await wrapper.find(".account-exit").trigger("click");
    await wait(() => expect(wrapper.find(".auth-page").exists()).toBe(true));
    await wrapper.find("#auth-email").setValue(email);
    await wrapper.find("#auth-password").setValue("minha senha segura 123");
    await wrapper.find(".auth-card form").trigger("submit");
    await wait(() => expect(wrapper.text()).toContain("Minha task particular"));
  });
  it("mantém o formulário aberto e mostra erro para credenciais inválidas", async () => {
    await open();
    await wrapper.find("#auth-email").setValue("naoexiste@example.com");
    await wrapper.find("#auth-password").setValue("senha incorreta");
    await wrapper.find(".auth-card form").trigger("submit");
    await wait(() => expect(wrapper.find('[role="alert"]').text()).toBe("E-mail ou senha incorretos."));
    expect(wrapper.find(".app-shell").exists()).toBe(false);
  });
});
