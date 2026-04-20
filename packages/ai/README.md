# @dwellverdict/ai

Home for **Scout** — the in-product AI assistant. Phase 0 intentionally leaves this empty.

When Scout is wired up (later phase), this package will hold:

- `tasks/` — task registry. Each entry declares trigger, prompt version, retrieval spec, output schema, model routing (Sonnet 4 vs. Haiku 4.5).
- `retrieval/` — pgvector helpers and per-user state-summary builders.
- `prompts/` — symlinks or loaders into the repo-root `prompts/` directory (versioned markdown).

Ground rules from `docs/CLAUDE.md`:

- Scout **drafts**, users **approve**. No autonomous sends, signs, or submissions.
- Every AI call logs `model_version`, `prompt_version`, token counts, `task_type`, source document ids.
- Tax-strategy outputs always carry the CPA disclaimer.
- Location Verdict output is golden-file tested for Fair Housing compliance on every prompt revision.
