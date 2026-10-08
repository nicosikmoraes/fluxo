import { defineConfig, mergeConfig } from 'vitest/config';
import vite from './vite.config';
export default mergeConfig(vite,defineConfig({test:{environment:'happy-dom',environmentOptions:{happyDOM:{url:'http://127.0.0.1:8002/'}},globalSetup:['./tests/server.js'],setupFiles:['./tests/setup.js'],fileParallelism:false,maxWorkers:1,testTimeout:15000,hookTimeout:15000}}));
