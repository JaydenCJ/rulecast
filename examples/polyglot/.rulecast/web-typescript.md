---
title: Web TypeScript conventions
description: Strict TypeScript rules for the web package
scope: packages/web/**
order: 20
---

- `strict` is on in tsconfig; never weaken compiler options in a PR.
- No `any` — use `unknown` plus narrowing, or fix the types upstream.
- React components are function components; hooks live in `src/hooks/`.
- Data fetching goes through `src/api/client.ts`, never raw `fetch` in components.
