/**
 * Public API for the bundled agency-agents content. The runtime data lives
 * in `agents.generated.ts`, produced by `scripts/generate-index.ts` that
 * scans `content/<division>/<slug>.md`, parses the YAML frontmatter, and
 * inlines each markdown body so consumers don't have to do filesystem or
 * Vite-glob wiring themselves.
 *
 * Source content is a one-time import from
 * https://github.com/msitarzewski/agency-agents (MIT). See LICENSE and
 * UPSTREAM_README.md at the package root.
 */
export type { Agent, Division } from "./agents.generated";
export {
  agents,
  divisions,
  agentsByDivision,
  agentBySlug,
  UPSTREAM_REPO_URL,
} from "./agents.generated";
