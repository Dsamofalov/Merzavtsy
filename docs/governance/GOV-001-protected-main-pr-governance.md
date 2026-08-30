# GOV-001 — Protected-main / PR governance evidence

Status: **NOT COMPLETE — owner decision required**  
Date: 2026-08-30  
Issue: #2 (`GOV-001`)  
Authoritative specification: `docs/superpowers/specs/2026-08-29-merzavtsy-world-engine-development-spec.md`  
Expected / observed spec blob SHA: `d3b6f59d83efb7c74c8ba3bb2bcc6012f606a89d`

## Scope

This note records repository-governance evidence only. It does not authorize or implement World Engine product code.

## Repository state re-read before GOV-001 work

- `main` HEAD: `a2cda426bc49c7af188ac190a6deb7c563a973e5`
- `main.protected`: `false`
- branch protection: disabled; required status checks enforcement is off
- repository rulesets: `[]`
- planning PR #104: OPEN / UNMERGED
- planning PR #104 head: `planning/world-engine-roadmap-bootstrap` at `463d4d55484d7b92dae9a34e58b48a6ee27df3a4`
- planning projection: `GOV-001` is the only root; `DEC-101` is OPEN

## Owner decision status

No explicit owner-approved protected-main / PR governance decision was found in issue #2, planning PR #104, the authoritative specification, branch-protection metadata, or repository ruleset metadata.

The instruction to resolve `GOV-001` is **not** treated as authorization to invent or apply a particular branch-protection or ruleset configuration. Therefore this run makes **no branch-protection or ruleset mutation**.

## Permitted interim governance rule

Until the repository owner records an explicit decision, the only permitted alternative is **fail closed**:

1. `GOV-001` remains incomplete.
2. No World Engine product implementation task may start.
3. `AUD-001` remains blocked and must not be claimed.
4. No worker may infer a protection policy, required check set, review count, bypass rule, or merge method from convention.
5. The only valid continuation scope is `GOV-001` recovery: obtain and record the owner's exact governance decision, then apply only the precisely authorized metadata change (if any) and verify it from repository metadata.

This fail-closed rule is a temporary safety state, not resolution of `DEC-101`.

## What the owner decision must make explicit

The owner must unambiguously state either:

- the exact protected-main / repository-ruleset policy to apply, including PR requirement, required checks, review requirement, bypass policy, and any merge-method constraint; or
- that no branch-protection / ruleset mutation is authorized, together with the exact procedural alternative that implementation workers are permitted to use and how compliance is objectively verified.

Absent one of those explicit decisions, `GOV-001` cannot satisfy its completion criteria and must not be merged as COMPLETE.

## Downstream lifecycle

No planning DAG or downstream lifecycle change is authorized while `GOV-001` is incomplete. In particular, `AUD-001` must remain blocked.
