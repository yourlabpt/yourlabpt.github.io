# Project Showcase Agent Prompt

Use this prompt with AI agents to generate payloads for **Admin Dashboard > Project Showcase**.

Important:
- Do **not** edit `script.js` manually for project content.
- Paste generated JSON in Admin and click `Apply Payload` or `Replace Collection`.
- The website reads projects from `/api/project-showcase`.

## Objective
Create bilingual (PT/EN) project stories that sell one clear transformation:
1. **Before**: the client pain and business pressure.
2. **Build**: how YourLab converted that pain into a working system.
3. **After**: the final result and how it runs in daily operations.
4. **Action**: a direct invitation to contact YourLab.

## Story-First Prompt Template (Copy/Paste)
```text
You are a B2B marketing strategist and conversion-focused case-study writer.
Generate a JSON payload for the YourLab Project Showcase.

CONTEXT
- Output will be pasted into Admin Dashboard > Project Showcase.
- Website is bilingual: pt + en.
- PT and EN must communicate the same meaning.
- Do not invent metrics or precise numbers unless they exist in source notes.

MODE
- operation: {{add|update|delete}}
- target_id: {{existing-id-or-empty}}

RAW INPUT
{{paste project notes, interviews, goals, pains, process, outcomes}}

WRITING STYLE (MANDATORY)
1) Keep language concrete, short, and client-facing.
2) No jargon, no buzzword stacking, no generic claims.
3) Prefer active voice and practical business outcomes.
4) If info is missing, stay honest and specific without filler.
5) Output valid JSON only (no markdown, no commentary).

STORY ARC (MANDATORY)
1) Who the client is and what they asked for.
2) What was painful and why it was risky/costly.
3) How YourLab built a practical system.
4) What changed after implementation.
5) How the solution works in day-to-day reality.
6) Close with a direct CTA.

COPY LIMITS (MANDATORY)
- title: max 8 words.
- strategicRequest: 1 sentence.
- painSnapshot: 1 sentence.
- businessImpact: 1 sentence.
- approach: max 3 bullets.
- solutionDelivered: max 3 bullets.
- results: max 3 bullets.
- dailyUse: max 2 bullets.
- ctaText: 1 sentence.

OUTPUT FORMAT (EXACT JSON SHAPE)
{
  "operation": "add",
  "target_id": "",
  "project": {
    "id": "kebab-case-id",
    "title": { "pt": "", "en": "" },
    "clientProfile": { "pt": "", "en": "" },
    "sector": { "pt": "", "en": "" },
    "timeline": { "pt": "", "en": "" },
    "strategicRequest": { "pt": "", "en": "" },
    "painSnapshot": { "pt": "", "en": "" },
    "businessImpact": { "pt": "", "en": "" },
    "approach": { "pt": ["", "", ""], "en": ["", "", ""] },
    "solutionDelivered": { "pt": ["", "", ""], "en": ["", "", ""] },
    "results": { "pt": ["", "", ""], "en": ["", "", ""] },
    "dailyUse": { "pt": ["", "", ""], "en": ["", "", ""] },
    "ctaText": { "pt": "", "en": "" }
  }
}
```

## Admin Workflow
1. Generate payload using the template above.
2. Open `admin.html` -> `Project Showcase` tab.
3. Paste JSON in `Apply Agent JSON`.
4. Click:
   - `Apply Payload` for add/update/delete.
   - `Replace Collection` only for full collection replacement.
5. Confirm the updated items in the right panel.

## Full Replace Format (Optional)
Use only when replacing all projects at once:
```json
{
  "projects": [
    {
      "id": "example-id",
      "title": { "pt": "...", "en": "..." },
      "clientProfile": { "pt": "...", "en": "..." },
      "sector": { "pt": "...", "en": "..." },
      "timeline": { "pt": "...", "en": "..." },
      "strategicRequest": { "pt": "...", "en": "..." },
      "painSnapshot": { "pt": "...", "en": "..." },
      "businessImpact": { "pt": "...", "en": "..." },
      "approach": { "pt": ["..."], "en": ["..."] },
      "solutionDelivered": { "pt": ["..."], "en": ["..."] },
      "results": { "pt": ["..."], "en": ["..."] },
      "dailyUse": { "pt": ["..."], "en": ["..."] },
      "ctaText": { "pt": "...", "en": "..." }
    }
  ]
}
```
