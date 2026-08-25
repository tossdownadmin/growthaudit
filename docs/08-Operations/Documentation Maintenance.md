---
title: Documentation Maintenance
tags: [growth-audit, documentation, operations]
status: maintained
---

# Documentation Maintenance

## Obsidian compatibility

The `docs` directory can be opened directly as an Obsidian vault or included in a larger vault. Notes use relative wiki-style internal links, YAML frontmatter, callouts, tables, code blocks, and Mermaid supported by Obsidian.

## Update rules

Update documentation when any of these change:

- route method, path, request, response, status, or timeout
- provider, environment variable, fallback, or cost behavior
- score weight, threshold, classification, or coverage rule
- persisted/public data shape
- module responsibility or dependency direction
- deployment topology or security control

## Creating notes

Use frontmatter:

```yaml
---
title: Human-readable title
tags: [growth-audit, domain]
status: maintained
source: path/to/source.ts
---
```

Add the note to the closest map of content and include a `Related notes` section. Prefer descriptive links such as `[[04-Modules/Module Index|Module Index]]` so files can be reorganized without degrading readability.

## Source-of-truth order

1. runtime application code
2. executable configuration and lockfiles
3. `COMPETITOR_ENGINE.md` for competitor semantic policy
4. maintained `docs/` notes
5. historical specifications under `src/`

## Validation checklist

- every runtime module appears in [[04-Modules/Module Index|Module Index]] or a linked module note
- every route appears in [[05-APIs/API Index|API Index]]
- every environment-variable reference appears in [[09-Reference/Environment Variables|Environment Variables]]
- all wikilinks resolve
- Mermaid blocks render in Obsidian
- documentation changes do not accidentally include `.env.local`, `.obsidian/workspace*`, `.next`, or `node_modules`

## Related notes

- [[00-Home|Project Home]]
- [[01-Project/Repository Map|Repository Map]]
