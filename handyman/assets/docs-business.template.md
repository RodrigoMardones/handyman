---
type: Doc
---

# Business

Describe the business domain and the use cases this project serves.
Implementers and reviewers read it to understand *why* a feature exists, not
only *how* it works.

> **Fill this during bootstrap by interviewing the user — do not guess or infer
> the domain from code.** The domain, stakeholders, and rules usually live only
> in the user's head. Ask the **Interview prompts** under each section, then
> replace the placeholder lines with the user's answers. Bootstrap is not
> complete until this file reflects real business context, not this template.

## Domain

Describe the business, the problem it solves, and who it serves.

**Interview prompts (ask the user):**

- What does this project do, and what problem does it solve?
- Who is it for, and what breaks for them if it does not exist?
- What does success look like for the business?

## Stakeholders

- List the users, roles, or systems that depend on this project.

**Interview prompts (ask the user):**

- Who uses this, directly or indirectly (people, teams, external systems)?
- Who decides what "done" means, and who is affected when it changes?

## Use Cases

Describe the concrete use cases this project addresses. For each one:

- **Name:** short identifier.
- **Actor:** who triggers it.
- **Goal:** the outcome they need.
- **Flow:** the main steps, end to end.
- **Rules:** constraints, policies, or invariants that must hold.

**Interview prompts (ask the user):**

- What is the central use case, end to end (actor → goal → flow)?
- Which business rules or invariants must never be violated?
- What are the most important edge cases or failure paths?

## Out Of Scope

- List business needs this project deliberately does not cover.

**Interview prompts (ask the user):**

- What does this project deliberately *not* do?
- Where does its responsibility end and another system's begin?

## Glossary

- Define domain terms so code, docs, and conversations share one language.

**Interview prompts (ask the user):**

- Which domain terms have a specific meaning here that an outsider might misread?
