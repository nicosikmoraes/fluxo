import { watch } from "vue";
import { currentLocale, t } from "../state/locale";

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function fieldError(field) {
  if (field.matches(":disabled") || field.readOnly) return "";
  const value = field.value.trim();
  const rules = field.dataset;
  if (rules.validateRequired !== undefined && !value) return t("Preencha este campo.");
  if (!value) return "";
  if (rules.validateMaxlength && Array.from(value).length > Number(rules.validateMaxlength)) {
    return t("Use no máximo {count} caracteres.", { count: rules.validateMaxlength });
  }
  if (field.type === "date") {
    if (!isValidDate(value)) return t("Informe uma data válida.");
    const format = (date) => new Intl.DateTimeFormat(currentLocale.value, { timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    if (rules.validateMin && value < rules.validateMin) return t("Escolha uma data a partir de {date}.", { date: format(rules.validateMin) });
    if (rules.validateMax && value > rules.validateMax) return t("Escolha uma data até {date}.", { date: format(rules.validateMax) });
  } else if (field.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return t("Informe um número válido.");
    if (rules.validateMin && number < Number(rules.validateMin)) return t("Informe um valor igual ou maior que {value}.", { value: rules.validateMin });
    if (rules.validateMax && number > Number(rules.validateMax)) return t("Informe um valor igual ou menor que {value}.", { value: rules.validateMax });
    if (rules.validateMoney !== undefined && !/^\d+(?:\.\d{1,2})?$/.test(value)) return t("Use até duas casas decimais.");
  }
  return "";
}

const instances = new WeakMap();
let errorId = 0;

// One directive owns the form's validation and accessible inline messages.
// It also works on a standalone date picker, before its change handler runs.
export const vValidate = {
  mounted(root) {
    const isForm = root.tagName === "FORM";
    if (isForm) root.noValidate = true;
    const errors = new Map();
    const fields = () => isForm ? [...root.querySelectorAll("input, textarea, select")] : [root];

    function clear(field) {
      const error = errors.get(field);
      if (!error) return;
      error.node.remove();
      const describedBy = (field.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== error.node.id).join(" ");
      if (describedBy) field.setAttribute("aria-describedby", describedBy);
      else field.removeAttribute("aria-describedby");
      if (error.invalid === null) field.removeAttribute("aria-invalid");
      else field.setAttribute("aria-invalid", error.invalid);
      field.classList.remove("field-invalid");
      errors.delete(field);
    }

    function validate(field) {
      const message = fieldError(field);
      if (!message) {
        clear(field);
        return true;
      }
      if (!errors.has(field)) {
        const node = document.createElement("span");
        node.id = `fluxo-field-error-${++errorId}`;
        node.className = "field-validation-error";
        node.setAttribute("role", "alert");
        const label = field.closest("label");
        // Keep currency prefixes and compact input rows intact.
        if (label && (root.contains(label) || !isForm)) label.append(node);
        else field.insertAdjacentElement("afterend", node);
        errors.set(field, { node, invalid: field.getAttribute("aria-invalid") });
        const describedBy = field.getAttribute("aria-describedby");
        field.setAttribute("aria-describedby", [describedBy, node.id].filter(Boolean).join(" "));
      }
      errors.get(field).node.textContent = message;
      field.classList.add("field-invalid");
      field.setAttribute("aria-invalid", "true");
      return false;
    }

    function submit(event) {
      const invalid = fields().filter((field) => !validate(field));
      if (!invalid.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      invalid[0].focus();
    }

    function change(event) {
      if (!event.target.matches("input, textarea, select")) return;
      if (!validate(event.target) && !isForm) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function input(event) {
      if (errors.has(event.target)) validate(event.target);
    }

    function refresh() {
      for (const field of errors.keys()) {
        if (field !== root && !root.contains(field)) clear(field);
        else validate(field);
      }
    }

    root.addEventListener("submit", submit, true);
    root.addEventListener("change", change, true);
    root.addEventListener("input", input);
    const stopLocale = watch(currentLocale, refresh);
    instances.set(root, {
      refresh,
      cleanup() {
        stopLocale();
        root.removeEventListener("submit", submit, true);
        root.removeEventListener("change", change, true);
        root.removeEventListener("input", input);
        for (const field of errors.keys()) clear(field);
      },
    });
  },
  updated(root) { instances.get(root)?.refresh(); },
  beforeUnmount(root) {
    instances.get(root)?.cleanup();
    instances.delete(root);
  },
};
