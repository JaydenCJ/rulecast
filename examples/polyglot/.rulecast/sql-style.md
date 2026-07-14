---
title: SQL style
description: Conventions for every .sql file, wherever it lives
scope: "**/*.sql"
order: 30
---

- Keywords uppercase, identifiers snake_case, one clause per line.
- Every migration is reversible; write the `down` before the `up`.
- No `SELECT *` outside ad-hoc analysis queries.
