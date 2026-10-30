import { defineConfig, mergeConfig } from "vitest/config";
import vite from "./vite.config";
export default mergeConfig(vite,defineConfig({test:{environment:"happy-dom",include:["tests/admin-prototype.test.js","tests/admin-live.test.js","tests/admin-public.test.js","tests/app-select.test.js"],fileParallelism:false,maxWorkers:1}}));
