import path from "node:path";
import { defineConfig } from "vitest/config";

// Lets tests import route handlers, which use the app's "@/..." paths.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
