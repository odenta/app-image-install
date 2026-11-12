// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "build/**", "dist/**", "implementation/**", ".hutch/**", ".cottontail-tmp/**"],
  },
  tseslint.configs.recommended,
);
