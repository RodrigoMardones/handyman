# Graph Report - handyman  (2026-07-01)

## Corpus Check
- 75 files · ~65,389 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1060 nodes · 1438 edges · 73 communities (65 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8a30fcbb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]

## God Nodes (most connected - your core abstractions)
1. `Harness Templates` - 37 edges
2. `check()` - 23 edges
3. `main()` - 22 edges
4. `Harness Workflow` - 17 edges
5. `🧰 Handyman` - 16 edges
6. `str` - 14 edges
7. `apply()` - 14 edges
8. `resolve_workspace()` - 14 edges
9. `Role Tools` - 14 edges
10. `Path` - 13 edges

## Surprising Connections (you probably didn't know these)
- `resolve_workspace()` --conceptually_related_to--> `Installation Scope (local/global)`  [INFERRED]
  handyman/scripts/validate_harness.py → SKILL.md
- `Hard Rules` --semantically_similar_to--> `Golden Rule: Data Not Instructions`  [INFERRED] [semantically similar]
  handyman/assets/AGENTS.template.md → references/security.md
- `resolve_workspace()` --shares_data_with--> `HARNESS_WORKSPACE`  [INFERRED]
  handyman/scripts/validate_harness.py → references/anatomy.md
- `test_security_contract()` --conceptually_related_to--> `Untrusted Content`  [INFERRED]
  tests/test_docs.py → handyman/references/anatomy.md
- `check_graphify_context()` --references--> `Graphify Context Layer`  [EXTRACTED]
  handyman/assets/init.template.sh → references/graphify.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Context Layer Harness Integration** — references_graphify_context_layer, assets_role_explorer_template_explorer, assets_init_template_check_graphify_context, assets_agents_template_navigation_map [INFERRED 0.85]
- **Handyman test harness (runner + three suites)** — tests_run_tests, tests_test_docs, tests_test_init, tests_test_update [EXTRACTED 0.95]
- **Four-role multi-agent model** — references_anatomy_leader, references_anatomy_implementer, references_anatomy_reviewer, references_anatomy_explorer [EXTRACTED 0.90]
- **Deterministic harness lifecycle tooling (scaffold/update/validate)** — scripts_scaffold, scripts_update_harness, scripts_validate_harness [INFERRED 0.80]
- **Handyman Role Lifecycle (leader delegates to implementer, reviewer, explorer)** — assets_role_leader_template_leader, assets_role_implementer_template_implementer, assets_role_reviewer_template_reviewer, assets_role_explorer_template_explorer [INFERRED 0.85]
- **Frontmatter-Then-Config-Then-Default Resolution Pattern** — references_models_resolution_order, references_tools_resolution_order, references_workflow_harness_workspace_resolution [INFERRED 0.80]
- **Feature Closure Flow (implement, review, close)** — references_workflow_implementer_protocol, references_workflow_reviewer_protocol, references_workflow_closure_protocol [INFERRED 0.85]

## Communities (73 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.24
Nodes (9): Explorer, Implementer, Leader, Per-Role Model Defaults, Golden Rule: Data Not Instructions, Threat Model, Untrusted Content & Indirect Prompt Injection, Per-Role Tool Defaults (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.20
Nodes (24): bool, int, str, Explorer role, Implementer role, Leader role, Reviewer role, Role Models (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (34): ArgumentParser, int, Path, str, _append_log(), build_parser(), _bump_updated(), cmd_add() (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (47): Progressive Disclosure pattern, int, Path, str, Anti Telephone Protocol, Backlog Contract, Feature List Contract, Harness Anatomy (+39 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (58): Untrusted Content, check(), fenced_blocks(), main(), bool, int, str, Guard against token-budget regressions on always-loaded surfaces. (+50 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (20): discovery, mcp, skills, handyman_root, harness_version, harness_workspace, install_mode, models (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (20): discovery, mcp, skills, handyman_root, harness_version, harness_workspace, install_mode, models (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (21): check_business_context(), check_evals(), check_feature_state(), check_graphify_context(), check_harness_files(), check_harness_version(), check_preflight(), check_tools() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (18): config, discovery, handyman_root, harness_version, harness_workspace, install_mode, post_run, project_name (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (14): Cambios, Evidencia del cambio, Revisores, Tarea o asunto asociado, copy_and_stamp(), copy_template(), make_dir(), stamp_version() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (5): assert_eq(), assert_exit(), fail(), pass(), assert.sh script

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (25): bool, int, Path, str, apply(), check(), current_skill_version(), ensure_managed_file() (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (5): CHECKPOINTS Final-State Checklist, Architecture, Data Flow, Principles, What Not To Do

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (6): Current Session, Log, Next Step, Plan, Session History, YYYY-MM-DD - Feature N: feature_name

### Community 16 - "Community 16"
Cohesion: 0.40
Nodes (4): Anti-patterns, Required Commands, Test Levels, Verification

### Community 17 - "Community 17"
Cohesion: 0.06
Nodes (33): additionalProperties, description, $ref, type, pattern, type, minLength, type (+25 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (22): 1. El objetivo, 2.1 El scaffold copia la plantilla genérica tal cual, 2.2 La plantilla tiene un único worked example, ajeno al repo, 2.3 Los campos esenciales y los raros conviven planos, 2.4 El form no dice qué se convierte en la entrada de `feature.py add`, 2.5 El ejemplo canónico no modela usar el form, 2. Cómo se usa hoy `feature-request` (el camino "copia"), 3.1 Campos que **siempre** aparecen (el núcleo real) (+14 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (22): 1. El objetivo, 2.1 Skills: progressive disclosure y la `description` como disparador, 2.2 MCPs y tools: lista de deferred tools + `tool_search` semántico, 2.3 El hilo común: descubrimiento semántico, no determinista, 2. Cómo se descubre hoy (a nivel de plataforma), 3.1 El mapa `tools` de `harness.config.json` es de *capability groups*, no de skills/MCPs, 3.2 El feature-request nombra skills como prosa libre, 3.3 Cero servidores MCP referenciados en el harness (+14 more)

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (22): float, ArgumentParser, bool, int, Path, str, build_parser(), cmd_measure() (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (22): ArgumentParser, int, Path, str, build_parser(), cmd_check(), cmd_find(), cmd_list() (+14 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (22): AGENTS.md, backlog/explore_<topic>.md, backlog/impl_<feature>.md, backlog/review_<feature>.md, CHECKPOINTS.md, docs/architecture.md, docs/business.md, docs/conventions.md (+14 more)

### Community 25 - "Community 25"
Cohesion: 0.09
Nodes (21): 1. La pregunta y por qué hoy no tiene respuesta, 2.1 La skill SÍ está versionada, 2.2 El harness instalado NO está versionado, 2.3 El verifier no conoce el concepto de versión, 2.4 Superficie de drift: qué añadió cada versión, 2. Diagnóstico del estado actual (con evidencia), 3. Qué cubren (y qué NO) las herramientas existentes, 4. Estrategias candidatas (+13 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (22): 🔎 Analizar Un Harness Existente, 🗂️ Archivos Principales, 🌐 Bootstrap Global, 🏠 Bootstrap Local, Casos De Uso, 📬 Contacto, ✅ Cuando Usarlo, 🚀 Ejecutar Una Feature (+14 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (20): 1. El objetivo, 2.1 La plantilla asume que el contexto "ya viene dado", 2.2 El Bootstrap Protocol no tiene paso de entrevista, 2.3 El ejemplo canónico modela el comportamiento equivocado, 2.4 El verifier no distingue una `business.md` rellenada de la plantilla cruda, 2. Cómo se rellena hoy `business.md` (el camino pasivo), 3. Causas raíz (con evidencia), 4. Investigación: mecanismos del proyecto que pueden forzar la entrevista (+12 more)

### Community 28 - "Community 28"
Cohesion: 0.10
Nodes (19): 1. El objetivo, 2. Lo que hoy SÍ es determinista (la línea base), 3.1 Caso A — agregar una entrada al `backlog/` (la brecha mayor), 3.2 Caso B — modificar `progress/current.md`, 3.3 Caso C — modificar `progress/history.md`, 3.4 Otros casos detectados (la parte "investiga si existen otros"), 3. Lo que hoy se hace a mano (con evidencia), 4. Causas raíz (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (20): 1. Cómo está hecho hoy (revisión de formato), 2. Oportunidades por eje, 3. Roadmap priorizado, 4. Recomendación para la próxima iteración, A1. `scripts/validate_harness.py` — validador de estructura, A2. CLI de gestión de `feature_list.json` (transiciones de estado), A3. `scripts/migrate.(sh|py)` — migración local ↔ global determinista, A4. JSON Schema para `feature_list.json` y `harness.config.json` (+12 more)

### Community 30 - "Community 30"
Cohesion: 0.10
Nodes (19): 1. El objetivo, 2.1 El artefacto que SÍ existe: `evals/trigger-eval.json`, 2.2 Lo que NO existe: ningún test ni runner lo consume, 2.3 El único guard de la `description` es de tamaño, no de activación, 2. Cómo se prueban hoy las evaluaciones del modelo (evidencia), 3.1 `skill-creator` distingue DOS clases de evaluación, 3.2 La mecánica clave del trigger eval: varianza y anti-overfit, 3.3 `mcp-builder`: evaluaciones estables, verificables y auto-resueltas (+11 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (18): Declaring Models In harness.config.json, Declaring Models In Role Files, Discovering Editor Models, Recommended Defaults, Resolution Order, Role Models, Updating Models In An Existing Harness, What To Document Per Project (+10 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (22): properties, $ref, type, pattern, type, minLength, type, enum (+14 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (17): 1. El objetivo, 2.1 El verifier: fases bloqueantes + advisories no bloqueantes, 2.2 El Drift vivo: evidencia de por qué esto importa *ya*, 2.3 Los otros tres controles existen como CLI, pero fuera del gate, 2.4 El post-run hoy: `feature.py done`, sin hooks, 2.5 La paradoja central, 2. Cómo se hace hoy (con evidencia), 3. Causas raíz (con evidencia) (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (17): description, $id, items, additionalProperties, properties, required, type, minItems (+9 more)

### Community 35 - "Community 35"
Cohesion: 0.12
Nodes (15): 1. Los síntomas reportados, 2. Cómo *debería* funcionar `bootstrap` (el camino determinista), 3.1 Contradicción: la tabla de `SKILL.md` dice una cosa y `scaffold.sh` hace otra, 3.2 La config está duplicada en dos archivos, 3.3 El verifier nunca valida el `feature_list.json` *vivo* contra el schema, 3.4 Las fechas son ubicuas en el harness, salvo en el `feature_list`, 3.5 La prosa de `bootstrap` habilita la improvisación, 3.6 Por qué esto **diverge entre modelos** (no solo entre ejecuciones) (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.40
Nodes (15): ArgumentParser, int, Path, str, build_parser(), cmd_explore(), cmd_impl(), cmd_review() (+7 more)

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (13): Business Domain Document, Reviewer, init.sh Verifier, Blocked Protocol, Bootstrap Protocol, Closure Protocol, Description Trigger Gate, Harness Workflow (+5 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (10): discovery, additionalProperties, properties, type, type, uniqueItems, mcp, skills (+2 more)

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (14): type, properties, minimum, type, minLength, type, blocked_reason, id (+6 more)

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (14): $ref, type, items, type, $ref, minLength, type, properties (+6 more)

### Community 41 - "Community 41"
Cohesion: 0.17
Nodes (12): Obsidian MOC (index.md), Frontmatter Conventions, Frontmatter Conventions, Obsidian Integration, Map Of Content (MOC), Migration From Plain Markdown, Obsidian Integration, Open The Workspace As A Vault (+4 more)

### Community 42 - "Community 42"
Cohesion: 0.17
Nodes (12): type, uniqueItems, additionalProperties, required, type, definitions, command_list, config (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.44
Nodes (10): int, Path, str, build_index(), err(), _features_section(), main(), _preserved_notes() (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.20
Nodes (9): 1. La alerta, 2. Causa raíz, 3. Sitios disparadores (evidencia leída), 4. El fix (reestructuración pasiva), 5.1 Test determinista (lo que sí podemos correr), 5.2 Limitación: el escáner en vivo (gap documentado), 5. Verificación, 6. Decisiones de alcance (+1 more)

### Community 45 - "Community 45"
Cohesion: 0.20
Nodes (9): Core Rules, Handyman, Installation Scope, License & Attribution, Operating Modes, Output Style, Quick Start, References (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.20
Nodes (9): How this complements the size cap, Limitations, `scripts/evals.py`, The boundary: deterministic contract vs stochastic measurement, The eval set: `evals/trigger-eval.json`, The non-blocking advisory, Trigger Evaluation, Two kinds of evaluation (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.05
Nodes (49): items, type, uniqueItems, definitions, command_list, discovery, role_models, role_tools (+41 more)

### Community 48 - "Community 48"
Cohesion: 0.36
Nodes (10): int, Path, str, _block(), main(), preflight(), Resolve HARNESS_WORKSPACE reusing validate_harness's precedence.      Imported l, Run a command, return (exit_code, combined_output). Never raises. (+2 more)

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (7): AGENTS.md - Agent Navigation Map, Before Starting, Hard Rules, Harness Location, AGENTS.md Agent Navigation Map, Repository Map, HARNESS_WORKSPACE Resolution

### Community 50 - "Community 50"
Cohesion: 0.25
Nodes (7): Backlog, Bridge Files, Docs, Progress, <project_name> - Handyman Workspace, State, Tags

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (7): Deterministic vs semantic: the boundary, How the platform discovers skills and MCPs, Limitations, Querying deterministically: `scripts/tools_discovery.py`, Skill and MCP Discovery, The `discovery` block in `harness.config.json`, The non-blocking advisory

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (7): Anti-Telephone Reminder, Anti-Telephone Reminder, Bootstrap A Local Harness Example, Example 1: Bootstrap A Local Harness, Example 2: Run One Feature, Harness Examples, Run One Feature Example

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (7): additionalProperties, description, $id, required, $schema, title, type

### Community 54 - "Community 54"
Cohesion: 0.15
Nodes (13): rules, enum, type, one_feature_at_a_time, require_tests_to_close, valid_status, type, additionalProperties (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.32
Nodes (8): items, type, items, minLength, type, items, acceptance, items

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (6): C1 - Harness Complete, C2 - State Coherent, C3 - Architecture Respected, C4 - Verification Real, C5 - Session Closed, CHECKPOINTS

### Community 58 - "Community 58"
Cohesion: 0.29
Nodes (6): Business, Domain, Glossary, Out Of Scope, Stakeholders, Use Cases

### Community 59 - "Community 59"
Cohesion: 0.29
Nodes (6): Feature Request - Handyman, Implementation request (mirror of feature `backlog_generator`), Research request (mirror of feature `deterministic_actions_per_layer`), Template (copy and fill), Why each section (map to the harness), Worked examples

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (6): Boundaries That Already Help, Checklist, Operating Rules Per Role, Security: Untrusted Content And Indirect Prompt Injection, The Golden Rule, What This Does Not Solve

### Community 62 - "Community 62"
Cohesion: 0.33
Nodes (5): Exploration: <topic>, Findings, Open Questions, Question, Source Locations

### Community 63 - "Community 63"
Cohesion: 0.33
Nodes (5): Code Conventions, Comments, Error Handling, Language And Runtime, Tests

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (4): Design Notes, Files Changed, Implementation Report: <feature_name>, Test Output

### Community 65 - "Community 65"
Cohesion: 0.40
Nodes (4): Checklist, Required Changes, Review: <feature_name>, Verdict

### Community 66 - "Community 66"
Cohesion: 0.40
Nodes (4): Cambios, Evidencia del cambio, Revisores, Tarea o asunto asociado

### Community 68 - "Community 68"
Cohesion: 0.60
Nodes (3): write_harness(), write_verifier(), test_feature.sh script

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (4): Feature Request Intake Form, run-feature Operating Mode, GRAPH_REPORT.md Audit, Leader Protocol

### Community 73 - "Community 73"
Cohesion: 0.83
Nodes (3): write_config(), write_skills(), test_tools_discovery.sh script

## Knowledge Gaps
- **514 isolated node(s):** `project`, `description`, `install_mode`, `project_name`, `project_root` (+509 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolve_workspace()` connect `Community 3` to `Community 2`, `Community 36`, `Community 43`, `Community 11`, `Community 48`, `Community 23`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 2` to `Community 3`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `apply()` connect `Community 11` to `Community 3`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `project`, `description`, `install_mode` to the rest of the system?**
  _584 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06103896103896104 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.061367621274108705 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._