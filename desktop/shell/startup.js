const status = document.getElementById("status");
if (status && typeof window.__FLUXO_STARTUP_ERROR__ === "string") {
  status.textContent = window.__FLUXO_STARTUP_ERROR__;
}
