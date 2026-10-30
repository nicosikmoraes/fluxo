import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import BillingSettings from "../src/features/billing/BillingSettings.vue";
import { auth } from "../src/features/auth/auth";
import { setLocale } from "../src/state/locale";

let wrapper;
const plan = {
  plan: "free",
  entitlements: { projects: 3, pay_calculation: false },
  price: { amount: 500, currency: "usd", interval: "month", amounts: { usd: 500, brl: 1299 } },
  usage: { projects: 0 },
  checkout_available: true,
  portal_available: false,
  subscription: null,
};
const respond = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const text = (element) => element.text().replace(/\s+/g, " ");

beforeEach(() => {
  auth.user = { id: 1, locale: "pt-BR" };
  auth.csrfToken = "billing-test-token";
  setLocale("pt-BR");
});
afterEach(() => {
  wrapper?.unmount();
  auth.user = null;
  setLocale("pt-BR");
  vi.unstubAllGlobals();
});

describe("Regional subscription prices", () => {
  it("shows fixed BRL and USD prices and preserves them when the language changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(plan));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(BillingSettings);
    await flushPromises();

    const rows = () => wrapper.findAll(".billing-price-option");
    expect(text(rows()[0])).toContain("Brasil");
    expect(text(rows()[0])).toContain("R$ 12,99");
    expect(text(rows()[1])).toContain("Outros países");
    expect(text(rows()[1])).toContain("US$ 5,00");
    expect(wrapper.text()).toContain("O idioma do aplicativo não altera o preço.");
    expect(wrapper.get(".billing-pro ul").text()).toContain("Jornada de trabalho completa");
    expect(wrapper.get(".billing-plan:not(.billing-pro) ul").text()).not.toContain("horas");

    setLocale("en-US");
    await nextTick();

    expect(text(rows()[0])).toContain("Brazil");
    expect(text(rows()[0])).toContain("R$12.99");
    expect(text(rows()[1])).toContain("Other countries");
    expect(text(rows()[1])).toContain("$5.00");
    expect(wrapper.text()).toContain("The app language does not change the price.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps checkout disabled and avoids displaying invented prices if loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ message: "Não foi possível carregar o plano." }, 503)));
    wrapper = mount(BillingSettings);
    await flushPromises();

    expect(wrapper.findAll(".billing-price-option")).toHaveLength(0);
    expect(wrapper.get('[role="alert"]').text()).toBe("Não foi possível carregar o plano.");
    expect(wrapper.get("button.btn.primary").element.disabled).toBe(true);
  });
});
