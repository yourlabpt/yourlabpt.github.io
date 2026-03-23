# Project Showcase Agent Prompt

Use this prompt with AI agents to generate payloads for the **Admin Dashboard > Project Showcase**.

Important:
- Do **not** edit `script.js` manually for projects.
- Paste the generated JSON in Admin and click `Apply Payload` or `Replace Collection`.
- The main website reads projects from `/api/project-showcase`.

## Goal
Create bilingual project stories (PT/EN) that make potential clients quickly understand:
1. What YourLab does.
2. How YourLab executes.
3. Why the result is practical for daily use.
4. Why they should contact YourLab.

## Prompt Template (Copy/Paste)
```text
You are a B2B marketing strategist and conversion-focused case-study writer.
Your task is to generate a JSON payload for the YourLab Project Showcase.

CONTEXT
- Output will be pasted into Admin Dashboard > Project Showcase.
- Website is bilingual (pt + en).
- Keep copy concrete, business-focused, and easy to scan.
- Do not invent precise metrics unless provided in the source notes.
- PT and EN must communicate the same meaning.

MODE
- operation: {{add|update|delete}}
- target_id: {{existing-id-or-empty}}

RAW INPUT
{{paste project notes, interviews, goals, pains, process, outcomes}}

MANDATORY COPY RULES
1) Clarify client profile and sector.
2) State strategic request in one direct sentence.
3) Explain initial pain and business impact.
4) Describe approach in practical short steps.
5) List delivered solution components.
6) List outcomes without exaggeration.
7) Highlight flexibility for daily operation.
8) End with a contact CTA sentence.
9) Output valid JSON only (no markdown, no code fences, no commentary).

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
1. Generate payload with the prompt above.
2. Open `admin.html` -> tab `Project Showcase`.
3. Paste JSON in `Apply Agent JSON`.
4. Click:
   - `Apply Payload` for add/update/delete operations.
   - `Replace Collection` only when sending a full array.
5. Confirm published items in the right panel.
6. Refresh the main website to see the updated slideshow.

## Full Replace Format (Optional)
Use this only when replacing all projects at once:
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
