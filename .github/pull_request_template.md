<!--
This template is for code. Another kind of pull request has its own, in .github/PULL_REQUEST_TEMPLATE/:
a new service (new-service.md), content (content.md), the user guide and the docs (guide.md).
Before you write, add &template=new-service.md to this page's address (?template= if it has no ?),
or from the command line: gh pr create --template new-service.md
-->

## What and why

<!-- What this changes, and the problem it solves. Link the issue: "Fixes #123". -->

## How it was tested

<!-- The tests added or run, and what you checked in the app. -->

## Screenshots

<!-- For anything visible: before and after. Hide anything personal. -->

## Checklist

- [ ] `npm run check` passes (Prettier, type checks, tests)
- [ ] Code and comments in English, text shown in the app in French
- [ ] No personal data in the code, the tests, the screenshots or this description
- [ ] Privacy and containment kept: identifiers masked for the engines, the user's approval before any action, a community service limited to what its manifest declares (if this touches them, the description says how)
- [ ] Docs updated if behavior changed (`README.md`, `docs/`, and the user guide in every language, `docs/guide/`)
- [ ] For content: an official source cited for each fact added or changed
