import { defineConfig, mergeConfig } from "vitest/config";
import vite from "./vite.config";

export default mergeConfig(vite, defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/work-hours.test.js", "tests/work-hours-runtime.test.js", "tests/internationalization.test.js"],
  },
}));
