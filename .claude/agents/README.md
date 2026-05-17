# Subagentes para AgriStock v2

Suite de 15 subagentes especializados para Claude Code, calibrados al dominio y stack de AgriStock v2 (CLAUDE.md como fuente de verdad).

## Instalación

### Opción 1 — por proyecto (recomendado)

Copia los archivos a `.claude/agents/` en la raíz de tu repo:

```bash
mkdir -p .claude/agents
cp agents/*.md .claude/agents/
```

Solo se activan en este proyecto. Los compartes con tu equipo vía git (commit `.claude/agents/`).

### Opción 2 — globales

Si quieres usarlos en cualquier proyecto local:

```bash
mkdir -p ~/.claude/agents
cp agents/*.md ~/.claude/agents/
```

### Verificar carga

Dentro de Claude Code:

```
/agents
```

Deberías ver los 15 subagentes listados.

---

## El roster

| # | Subagente | Modelo | Cuándo invocarlo |
|---|---|---|---|
| 1 | **tech-lead** | opus | Orquestador por defecto para tareas medianas-grandes que cruzan disciplinas |
| 2 | **senior-developer** | opus | Decisiones de arquitectura, code review crítico, disputas técnicas |
| 3 | **database-architect** | sonnet | Schema, RLS, RPCs, índices, migraciones, triggers |
| 4 | **frontend-engineer** | sonnet | React/TS, hooks, formularios, componentes |
| 5 | **ui-designer** | sonnet | Diseño visual, polish, design system |
| 6 | **qa-engineer** | sonnet | Plan de pruebas, pgTAP, Vitest, Playwright |
| 7 | **bug-hunter** | opus | Reproducir, diagnosticar, fix mínimo + test de regresión |
| 8 | **security-auditor** | opus | RLS, auth, threat model, fugas cross-tenant |
| 9 | **code-reviewer** | sonnet | PR-level review, estilo, mantenibilidad |
| 10 | **devops-engineer** | sonnet | CI/CD, Vercel, Supabase, pg_cron, backups |
| 11 | **product-strategist** | opus | Scope, prioridad, user stories, trade-offs |
| 12 | **docs-writer** | sonnet | Manuales (es-MX), copy in-app, ADRs, release notes |
| 13 | **performance-engineer** | sonnet | Profiling, índices, bundle size, query speed |
| 14 | **compliance-officer** | opus | CFDI, LFPDPPP, contratos B2B, retención |
| 15 | **integration-specialist** | sonnet | DOF FIX, Resend, webhooks, APIs externas |

---

## Cómo trabajar con ellos

### Flujo recomendado por defecto

**Empieza siempre por `tech-lead`.** Él decide a quién invocar y en qué orden:

```
> usa tech-lead: implementa el módulo de requisiciones de compra
```

`tech-lead` rompe la tarea en piezas, llama a los especialistas que correspondan (product-strategist → database-architect → frontend-engineer → ui-designer → qa-engineer → security-auditor → code-reviewer → docs-writer), integra resultados y te entrega un deliverable coherente.

### Invocación directa cuando ya sabes qué necesitas

Para tareas pequeñas o cuando la disciplina es obvia, invoca directamente:

```
> usa database-architect: necesito el RPC para procesar una recepción de OC
```

```
> usa bug-hunter: el saldo de un item no cuadra con el kardex, revisa
```

```
> usa ui-designer: revisa esta pantalla de detalle de OT y sugiere mejoras
```

---

## Patrones de uso típicos

### Patrón "feature completa" (vertical slice)

```
tech-lead → product-strategist (AC)
         → database-architect (schema + RPC + RLS)
         → senior-developer (review si hay invariantes)
         → frontend-engineer (UI)
         → ui-designer (polish)
         → qa-engineer (tests)
         → security-auditor (si toca datos sensibles)
         → code-reviewer (gate final)
         → docs-writer (manual + changelog)
```

### Patrón "bug urgente"

```
bug-hunter → reproduce + root cause + test fallando
specialist  → fix mínimo
code-reviewer → revisa
qa-engineer → verifica test pasa, suite verde
```

### Patrón "página lenta"

```
performance-engineer → mide + identifica bottleneck
database-architect O frontend-engineer → fix (índice, virtualización, etc.)
qa-engineer → budget check para evitar regresión
```

### Patrón "pre-producción"

```
devops-engineer → deploy plan + backup + rollback
security-auditor → barrido final (RLS, secrets, deps)
compliance-officer → aviso de privacidad + contrato B2B
```

---

## Reglas de oro

1. **`tech-lead` por defecto.** Si dudas, empieza ahí.
2. **`senior-developer` tiene voto de calidad.** Si dos subagentes discrepan en algo arquitectónico, él decide.
3. **`security-auditor` y `compliance-officer` son veto.** Cualquier hallazgo crítico bloquea el merge.
4. **`bug-hunter` antes de parchear.** Diagnóstico antes que código. Test antes que fix.
5. **`code-reviewer` antes de cada merge.** Último gate, siempre.
6. **CLAUDE.md es la fuente de verdad.** Si un subagente sugiere algo que la contradice, gana CLAUDE.md (o se edita primero).

---

## Customización

Cada subagente vive en su propio `.md` con frontmatter YAML:

```yaml
---
name: nombre-del-agente
description: cuándo invocarlo
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus | sonnet
---

[system prompt]
```

Para ajustar:
- **Cambiar comportamiento:** edita el system prompt directamente.
- **Cambiar modelo:** cambia `model: sonnet` → `opus` (más caro, más capaz) o viceversa.
- **Limitar herramientas:** quita herramientas del campo `tools` para reducir blast radius (ej. `docs-writer` no necesita `Bash`).
- **Cambiar trigger:** ajusta el `description` para que Claude Code los invoque proactivamente con más o menos frecuencia.

---

## Siguiente paso sugerido

1. Copia los archivos a `.claude/agents/` de tu repo de AgriStock v2.
2. Confirma carga con `/agents` dentro de Claude Code.
3. Arranca el primer sprint con:

   ```
   > usa tech-lead: arranquemos Sprint 0 — fundación. Quiero CI/CD, ambientes,
     auth básico, layout, y schema inicial de organizations + profiles + user_roles + audit_log.
   ```

   `tech-lead` coordinará a `devops-engineer`, `database-architect`, `frontend-engineer` y `security-auditor` automáticamente.

---

## Notas operativas

- **Costo:** los `opus` son más caros por token. Si quieres reducir gasto, baja a `sonnet` los que tengas menos críticos (`tech-lead`, `senior-developer`, `bug-hunter`, `security-auditor`, `compliance-officer`, `product-strategist` son los que más gana mantener en opus).
- **Conflictos entre subagentes:** los resuelve `tech-lead`. Si el conflicto es técnico, escala a `senior-developer`.
- **No los uses a todos en cada tarea.** El roster está diseñado para que `tech-lead` elija. Forzar a los 15 en cada PR sería ruido y costo desperdiciado.
