import { createApp } from "vue";
import App from "./Root.vue";
import "./style.css";
import "./features/appearance/theme.css";
import { initializeTheme } from "./features/appearance/theme";
initializeTheme();
createApp(App).mount("#app");
