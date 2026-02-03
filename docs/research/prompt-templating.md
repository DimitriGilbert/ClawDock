# Prompt Templating Research

**Date:** 2026-02-03  
**Status:** Complete  
**Complexity:** Low

## Problem Statement

ClawDock needs a Prompt Manager for recurring operations:
- Heartbeat prompts for checking Bays
- Default operation prompts
- User-customizable templates
- Variable substitution, conditionals, loops, and partials

Decided format: **Markdown with YAML frontmatter + Handlebars templating**

```markdown
---
name: email-check
variables:
  - bay_name
  - unread_count
---
# Email Check for {{bay_name}}
You have {{unread_count}} unread emails.
{{#if priority_senders}}Priority: {{priority_senders}}{{/if}}
```

---

## Existing Solutions

### 1. Handlebars Integration in TypeScript

**Library:** `handlebars` (npm)

Key patterns for type-safe integration:

```typescript
import Handlebars from 'handlebars';

// Type-safe compilation with generics
interface TemplateContext {
  bay_name: string;
  unread_count: number;
  priority_senders?: string[];
}

const template = Handlebars.compile<TemplateContext>(source);
const result = template({ bay_name: 'Email', unread_count: 5 });
```

**Typed Helpers:**
```typescript
const uppercaseHelper: Handlebars.HelperDelegate = (str: unknown) => {
  if (typeof str !== 'string') throw new Error('Requires string');
  return str.toUpperCase();
};
Handlebars.registerHelper('uppercase', uppercaseHelper);
```

**Best Practices:**
- Use `Handlebars.compile<T>()` for compile-time type hints
- Define helpers with `Handlebars.HelperDelegate` type
- Keep template logic minimal - compute values in TypeScript, pass simple data
- Validate context at runtime with Zod before rendering

### 2. Frontmatter Parsing

**Library:** `gray-matter` (npm) - Industry standard, has built-in TypeScript types

```typescript
import matter from 'gray-matter';

interface PromptFrontmatter {
  name: string;
  variables: string[];
  model?: string;
  temperature?: number;
}

const { data, content } = matter(rawMarkdown);
const frontmatter = data as PromptFrontmatter;
```

**Combine with Zod for runtime validation:**
```typescript
import { z } from 'zod';

const PromptSchema = z.object({
  name: z.string(),
  variables: z.array(z.string()),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const { data, content } = matter(rawMarkdown);
const frontmatter = PromptSchema.parse(data); // Runtime validated
```

### 3. How LangChain/LlamaIndex Handle Templates

**LangChain (TypeScript):**
```typescript
import { PromptTemplate } from "@langchain/core/prompts";

const template = PromptTemplate.fromTemplate("Tell me about {topic}");
await template.invoke({ topic: "cats" });
```

- Uses `{variable}` syntax (single braces)
- No built-in conditionals/loops (simpler than Handlebars)
- Templates are objects with `.invoke()` method
- ChatPromptTemplate for multi-message prompts

**Key difference:** LangChain templates are code-defined, not file-based. Our approach (file-based Markdown) gives us:
- Non-developer editing capability
- Git-based versioning
- Separation of prompts from code

### 4. Prompt Management Best Practices

From industry research:

| Practice | Our Approach |
|----------|-------------|
| Decouple prompts from code | `config/prompts/*.md` files |
| Version control | Git-based in repo |
| Standardized variables | Handlebars `{{variable}}` |
| Store metadata | YAML frontmatter |
| Runtime validation | Zod schemas |

---

## Recommendation

**Stack for ClawDock Prompt Manager:**

| Component | Library | Purpose |
|-----------|---------|---------|
| Templating | `handlebars` | Variable substitution, conditionals, loops |
| Frontmatter | `gray-matter` | Parse YAML metadata from Markdown |
| Validation | `zod` (already in project) | Runtime type safety for frontmatter |
| File loading | Node.js `fs` | Read templates from disk |

**Why this stack:**
1. **Handlebars** - More powerful than simple `{var}` replacement, supports `{{#if}}`, `{{#each}}`, partials
2. **gray-matter** - Zero-config, TypeScript-ready, handles YAML frontmatter perfectly
3. **Zod** - Already a dependency, provides runtime validation
4. No heavy dependencies like full LangChain needed

---

## Implementation Notes

### Minimal PromptManager Class

```typescript
import Handlebars from 'handlebars';
import matter from 'gray-matter';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

// Frontmatter schema
const PromptMetaSchema = z.object({
  name: z.string(),
  variables: z.array(z.string()).optional(),
  description: z.string().optional(),
});

type PromptMeta = z.infer<typeof PromptMetaSchema>;

interface CompiledPrompt {
  meta: PromptMeta;
  render: (context: Record<string, unknown>) => string;
}

export class PromptManager {
  private prompts = new Map<string, CompiledPrompt>();
  
  constructor(private promptsDir: string) {
    this.loadPrompts();
  }
  
  private loadPrompts() {
    const files = readdirSync(this.promptsDir).filter(f => f.endsWith('.md'));
    
    for (const file of files) {
      const raw = readFileSync(join(this.promptsDir, file), 'utf-8');
      const { data, content } = matter(raw);
      const meta = PromptMetaSchema.parse(data);
      const template = Handlebars.compile(content.trim());
      
      this.prompts.set(meta.name, {
        meta,
        render: (ctx) => template(ctx),
      });
    }
  }
  
  get(name: string): CompiledPrompt | undefined {
    return this.prompts.get(name);
  }
  
  render(name: string, context: Record<string, unknown>): string {
    const prompt = this.get(name);
    if (!prompt) throw new Error(`Prompt not found: ${name}`);
    return prompt.render(context);
  }
}
```

### Example Template File

`config/prompts/heartbeat.md`:
```markdown
---
name: heartbeat
variables:
  - bay_name
  - last_check
  - status
description: Check Bay health status
---
# Bay Status Check: {{bay_name}}

Last checked: {{last_check}}
Current status: {{status}}

{{#if errors}}
## Errors Detected
{{#each errors}}
- {{this}}
{{/each}}
{{/if}}

Please verify the Bay is operating correctly and report any issues.
```

### Registering Custom Helpers

```typescript
// Register before loading prompts
Handlebars.registerHelper('uppercase', (str) => String(str).toUpperCase());
Handlebars.registerHelper('formatDate', (date) => new Date(date).toLocaleString());
Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
```

### Partials for Reusable Sections

```typescript
// Register a partial
Handlebars.registerPartial('bayHeader', '## Bay: {{name}} ({{status}})');

// Use in template: {{> bayHeader}}
```

### Security Considerations

1. **HTML Escaping:** Handlebars escapes `{{var}}` by default. Use `{{{var}}}` for raw output only when trusted.

2. **Template Injection:** Since templates come from config files (not user input), injection risk is low. However:
   - Never compile user-provided strings as templates
   - Validate context data with Zod before rendering
   - Use delimiters in prompts for user-provided content

3. **Path Traversal:** Validate template names don't contain `../` when loading by name.

---

## Package Installation

```bash
pnpm add handlebars gray-matter
pnpm add -D @types/handlebars  # Types included in handlebars@4.7+, may not be needed
```

Note: `zod` is already in the project dependencies.

---

## Open Questions

1. **Hot reloading?** Should templates reload on file change during dev? (Could use `chokidar`)

2. **Template inheritance?** Do we need base templates that others extend? (Handlebars partials may suffice)

3. **Variable validation?** Should we validate that all declared `variables` are provided at render time?

4. **Caching strategy?** In production, templates should be loaded once. In dev, maybe reload on each request?

5. **API shape?** What does the API endpoint look like for agents consuming prompts?
   - `GET /prompts/:name` - Get compiled prompt with variables filled?
   - Or just load from filesystem within the agent process?

---

## Summary

- Use **Handlebars + gray-matter + Zod** - minimal, type-safe stack
- Store prompts in `config/prompts/*.md` with YAML frontmatter
- PromptManager class (~50 lines) handles loading and rendering
- Follows industry best practices (versioned, separated from code, validated)
- Low complexity, fits ClawDock's self-evolving philosophy
