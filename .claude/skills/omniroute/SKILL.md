---
name: omniroute
description: OmniRoute, the self-hosted AI gateway that routes one OpenAI-compatible endpoint across many model providers with fallback combos. Use when Chris mentions OmniRoute, Omni Route, OMNIROUTE_URL or OMNIROUTE_KEY, or wants to set it up, route models through it, add providers, build combos, check usage or cost, or run its CLI.
---

# OmniRoute

Guides from github.com/diegosouzapw/OmniRoute (MIT, see LICENSE), commit bf9f62c.
Open only the guide the task needs. `<id>.endpoints.md` is the full endpoint list for that guide.

## Setup
- REST: needs `OMNIROUTE_URL` (default `http://localhost:20128`) and `OMNIROUTE_KEY` in the environment. Start with `guides/omni-auth.md`.
- CLI: `npm i -g omniroute`, then `guides/cli-serve.md` and `guides/cli-setup.md`.
- Never print, echo or commit `OMNIROUTE_KEY` or any provider key. Never ask Chris to paste a key into chat.

## Guides
- `guides/cli-a2a.md`: Interact with the OmniRoute A2A server from the CLI. Send tasks, inspect skill execution history, and test the JSON-RPC 2.0 agent-to-agent protocol interactively.
- `guides/cli-backup-sync.md`: Backup and restore OmniRoute data from the CLI. Trigger incremental snapshots, sync to cloud storage, manage backup schedules, and restore from archive files.
- `guides/cli-batches.md`: Submit and monitor batch inference jobs from the CLI. Upload and manage files for batch processing, retrieve results, and integrate batch pipelines with CI/CD workflows.
- `guides/cli-chat.md`: Send chat completions, stream responses, and start an interactive REPL session from the CLI. Supports all OmniRoute providers, combo routing, and system prompt configuration.
- `guides/cli-compression.md`: Configure and test prompt compression from the CLI. Manage RTK filters, Caveman rules, stacked compression modes, and preview compression output with real prompts.
- `guides/cli-contexts.md`: Manage context engineering configurations, RTK filter sets, and conversation sessions from the CLI. Apply context-relay settings and inspect active context pipelines.
- `guides/cli-cost-usage.md`: View cost breakdowns, token usage, and call logs from the CLI. Filter by provider, model, or date range. Export usage reports and inspect per-connection spending.
- `guides/cli-eval.md`: Create and run evaluation suites, watch live benchmark progress, view scorecards, compare model performance, and integrate eval runs with CI workflows from the CLI.
- `guides/cli-health.md`: Check server health, component status, and live metrics from the CLI. Run `health`, `health components`, and `health watch` for a real-time dashboard of circuit breakers and provider status.
- `guides/cli-keys.md`: Create, list, rotate, and revoke OmniRoute API keys from the CLI. Manage OAuth flows for provider authentication and inspect key scopes and expiration.
- `guides/cli-mcp.md`: Inspect the MCP server status, list registered tools and scopes, run tool invocations, and manage MCP audit logs from the CLI.
- `guides/cli-models.md`: Query available AI models, list model aliases, and browse the full model catalog from the CLI. Filter by provider, search by capability, and resolve model name variants.
- `guides/cli-plugins-skills.md`: Manage Omni Skills (list, install, test, remove), plugins (create, configure), and persistent memory (search, add, clear) from the CLI.
- `guides/cli-policy-audit.md`: Inspect audit logs, manage access policies, view telemetry data, and review request history from the CLI. Filter by event type, user, or time range for compliance workflows.
- `guides/cli-providers.md`: Manage provider connections from the CLI: list available/configured providers, add, test, test-all, validate, rotate API keys, and view per-provider metrics.
- `guides/cli-resilience.md`: Inspect and manage circuit-breaker states, connection cooldowns, quota limits, and backoff levels from the CLI. Reset stuck providers and configure resilience thresholds.
- `guides/cli-routing.md`: Create, list, update, and delete routing combos from the CLI. Test routing strategies, inspect combo metrics, and configure fallback chains interactively.
- `guides/cli-serve.md`: Start, stop, and restart the OmniRoute server from the CLI. Manage daemon mode, port configuration, auto-recovery, system tray integration, and the dashboard open shortcut.
- `guides/cli-setup.md`: Run initial setup, configure global CLI settings, manage environment variables, check for updates, and configure autostart via the CLI setup and config commands.
- `guides/cli-skill-collector.md`: Detect installed CLI coding tools (Claude Code, Codex, Cursor, Copilot, Cline and more), search GitHub for matching agent skills, and install them to the detected tools via OmniRoute's built-in APIs.
- `guides/cli-tunnel.md`: Start and stop tunnel connections (ngrok, Cloudflare, custom) from the CLI. Inspect active tunnel URLs, configure authentication, and test external reachability.
- `guides/config-codex-cli.md`: Step-by-step agent workflow to configure the OpenAI Codex CLI on any machine (Linux, macOS, Windows) to use OmniRoute as an OpenAI-compatible backend. Detects OS and shell, writes config.toml and 7 named profiles, sets environment variables, and verifies the setup.
- `guides/omni-agents-a2a.md`: Interact with OmniRoute via JSON-RPC 2.0 agent-to-agent protocol. 6 built-in A2A skills: smart-routing, quota-management, provider-discovery, cost-analysis, health-report, list-capabilities.
- `guides/omni-api-keys.md`: Create, list, rotate, and revoke OmniRoute API keys. Control per-key scopes, spending limits, and expiration. Keys gate access to all proxy and management endpoints.
- `guides/omni-auth.md`: Manage API key authentication and session tokens. Start here to authenticate requests via Bearer token, obtain session cookies, and configure login requirements for the OmniRoute API.
- `guides/omni-budget.md`: Configure spending limits, token quotas, and rate-limit policies per API key or globally. Inspect current consumption and enforce cost controls across providers.
- `guides/omni-cache.md`: Manage the LLM response cache. View cache statistics, clear entries, configure TTL policies, and control semantic-similarity caching thresholds.
- `guides/omni-cli-tools.md`: Manage CLI tool integrations exposed via the API. List, configure, and invoke CLI tool plugins that extend OmniRoute's automation surface.
- `guides/omni-combos-routing.md`: Create and manage routing combos with 19 strategies (priority, weighted, round-robin, Auto-combo, and more). Configure fallback chains, test routing outcomes, and retrieve combo metrics.
- `guides/omni-compression.md`: Configure RTK (command output), Caveman (prose), and stacked compression modes. Manage language packs, custom rules, and test prompt compression reducing tokens by 60–90%.
- `guides/omni-context-rtk.md`: Configure RTK filters, context engineering rules, and context relay settings. Test compression with real prompt samples and manage context transformation pipelines.
- `guides/omni-db-backups.md`: Trigger system backups, restore from backup files, and manage the SQLite database lifecycle. Supports export, import, and incremental snapshot strategies.
- `guides/omni-github-skills.md`: Search, score, scan, and import agent skills from GitHub repositories that contain SKILL.md, CLAUDE.md, .cursorrules, and similar agent skill files. Discover community skills across many tool and provider categories, evaluate relevance with heuristic scoring, check for malware or hardcoded secrets, and install into Hermes, Claude Code, Gemini CLI, or OpenCode agent directories.
- `guides/omni-inference.md`: The core OpenAI-compatible inference endpoints: chat completions, embeddings, images, audio (TTS/STT), moderations, rerank, and the Responses API. The primary integration surface for AI agents.
- `guides/omni-mcp.md`: Connect to the OmniRoute MCP server (110 tools, 3 transports: SSE/stdio/HTTP). Covers routing, cache, compression, memory, skills, providers, and audit tools across 33 permission scopes.
- `guides/omni-models.md`: Query available AI models across all configured providers. List models, resolve model aliases, and browse the full model catalog including provider-specific variants.
- `guides/omni-providers.md`: Manage provider connections, API keys, OAuth flows, and connection tests via the REST API. List, add, update, remove, and test AI provider integrations across OmniRoute's 374-provider catalog.
- `guides/omni-proxies.md`: Configure HTTP/HTTPS/SOCKS proxies for upstream provider requests. Set per-provider or global proxy rules, test connectivity, and manage proxy rotation.
- `guides/omni-resilience.md`: Monitor provider health, circuit-breaker states, p50/p95/p99 latency metrics, and budget guard alerts. Inspect connection cooldowns and model lockouts in real time.
- `guides/omni-settings.md`: Read and update global application settings: system prompts, thinking budget, IP filters, payload rules, combo defaults, and require-login configuration.
- `guides/omni-sync-cloud.md`: Synchronise OmniRoute configuration, provider connections, and settings to/from cloud storage. Manage cloud worker authentication and remote backup targets.
- `guides/omni-tunnels.md`: Create and manage secure tunnels (ngrok, Cloudflare Tunnel, custom) to expose OmniRoute to the internet or share access with remote agents and CI pipelines.
- `guides/omni-usage-logs.md`: Access detailed call logs and usage analytics. Filter by provider, model, time range, status, and cost. Export logs and aggregate token usage across all connections.
- `guides/omni-version-manager.md`: Install, start, stop, restart, and update embedded services (9Router, CLIProxyAPI). Monitor service status, retrieve logs, and configure auto-start for local-only service endpoints.
- `guides/omni-webhooks.md`: Register, list, test, and remove webhook endpoints. Configure event subscriptions (request.completed, request.failed, quota.exceeded, etc.) and manage delivery retries.
