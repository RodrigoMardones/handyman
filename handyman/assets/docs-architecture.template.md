# Architecture

This document defines what good work means in this repo. Reviewers evaluate code against it.

## Principles

1. Clear layers: describe allowed modules and dependencies.
2. Dependency policy: list allowed dependencies and approval rules for new ones.
3. Explicit errors: describe how failures are represented.
4. Data policy: describe mutability, persistence, schema, and migration rules.
5. IO policy: describe where IO belongs and what must be atomic or transactional.

## Data Flow

Describe user input -> application layer -> domain layer -> storage or external systems.

## What Not To Do

- List architecture violations that reviewers must reject.
