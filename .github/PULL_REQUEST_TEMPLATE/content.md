## What changes

<!-- The skill, démarche, calendar date, site or news source, its file in packages/content/, and what was wrong or missing. Link the issue: "Fixes #123". -->

## Sources

<!-- For each fact added or changed, the official source that says it (Légifrance, service-public.fr, the administration concerned), quoted where it helps, with the day you read it. For a news source, its feeds. -->

## Checklist

- [ ] `npx vitest run --project content` and `npm run check` pass
- [ ] Each claim says what its source says, and each source is official (`docs/content.md`, "Rules for every file")
- [ ] `updated` bumped and `owner` right; `verified` left as it was (the reviewer sets it)
- [ ] A skill only tells the engine how to use Marianne's tools, nothing that would set its instructions aside
- [ ] The actions point at the right site, setting, document type, sheet or service
- [ ] What the user reads is in French; no personal data, not even as an example
