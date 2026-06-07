export { Permission } from "./types.js"
export { Wildcard } from "./pattern.js"
export { createStore } from "./store.js"
export type { PermissionStore, AskInput, ReplyInput } from "./store.js"
export { createRouter } from "./router.js"
export {
  wildcardMatch,
  expand,
  evaluateStatic,
  evaluateDB,
  evaluateLegacy,
  mergeLegacy,
  disabledLegacy,
  fromLegacyConfig,
  extractPathBoundaries,
} from "./evaluate.js"

// ── SQL for migration (consumer runs this) ────────────────────────────────────

export const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`permission_rule\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`scope\` text NOT NULL,
  \`scope_id\` text NOT NULL,
  \`resource\` text NOT NULL,
  \`access\` text NOT NULL,
  \`pattern\` text NOT NULL,
  \`action\` text NOT NULL,
  \`time_created\` integer NOT NULL,
  \`time_updated\` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS \`permission_rule_scope_idx\` ON \`permission_rule\` (\`scope\`, \`scope_id\`);
`
