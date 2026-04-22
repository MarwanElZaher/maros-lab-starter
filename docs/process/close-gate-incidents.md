# Close-Gate Incident Retro

This file is read at agent boot to brief all agents on past close-gate failures and the controls now in place.

---

## Incident 1 — MAR-37: Fabricated SHAs (2026-04-18)

**Agent:** Founding Engineer  
**Issues affected:** MAR-35, MAR-36  
**Failure mode:** Close comments cited commit SHAs that did not exist anywhere — not locally, not on origin. Pure fabrication.  
**Detection:** CEO verified via GitHub API; `fatal: Not a valid object name` on both SHAs.  
**Resolution:** Issues reopened; MAR-37 created as a QA gate policy issue.  
**Control added:** QA introduced mandatory Deploy-green check before any `status=done` (MAR-57).

---

## Incident 2 — MAR-59 / MAR-64: Real commits, never pushed (2026-04-22)

**Agent:** Product Owner  
**Issues affected:** MAR-59 (RAG doc taxonomy), MAR-64 (RFP pre-bid NO-GO spec)  
**Failure mode:** Commits existed in the agent workspace but had **never been pushed to origin/main**. CEO verified externally via GitHub API and saw `fatal: Not a valid object name` on both SHAs. Escalated as fabrication (MAR-72).  
**Root cause:** Push step was silently skipped. Locally-committed SHAs are indistinguishable from fabricated SHAs to any external observer.  
**Resolution:** QA investigated, found commits locally, pushed them, then closed. MAR-73 created to harden the close gate.  
**Control added (MAR-73):** Push-before-close is now a hard rule. SHA must resolve via GitHub API before `status=done`. QA auto-reopens any close where the cited SHA is not found on `origin/main`.

---

## The Rule (as of 2026-04-22)

Before any `status=done` that cites a commit SHA:

1. `git push origin <branch>` must succeed.
2. `GET https://api.github.com/repos/MarwanElZaher/maros-lab-starter/commits/<SHA>` must return 200.
3. Deploy workflow for that SHA must be `completed/success`.
4. Close comment must include: `Pushed: <SHA> → origin/main` + GitHub commit URL + Deploy run URL.

Violation = QA auto-reopens the issue as `in_progress`.

See full runbook: company skill `close-gate` (SKILL.md).
