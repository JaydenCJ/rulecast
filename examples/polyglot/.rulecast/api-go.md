---
title: API service conventions
description: Go rules for the API service
scope: services/api/**
order: 20
---

- Errors are wrapped with `%w` and checked with `errors.Is` / `errors.As`.
- Handlers stay thin: parsing and validation in the handler, logic in `internal/`.
- Every exported function has a doc comment; run `go vet` before pushing.
- Database access goes through the repository layer, never inline SQL in handlers.
