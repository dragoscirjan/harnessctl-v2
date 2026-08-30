# Task for reviewer

Read-only independent Verify review for Epic hrn-00156. Inspect .pi/mcp.json and .harnessctl/issues/hrn-00156-keep-repository-local-pi-sdlc-code-index-mcp-config-valid.yml. Map acceptance: sdlc_code_index appears/should appear in Pi MCP server list after reload/restart; command exactly cgc args mcp start; requestTimeoutMs and no invalid type/enabled/timeout; sdlc_cvs_github unchanged; no provider mutation/remote/destructive work. Assess correctness, maintainability, security/privacy, compatibility. Do not edit files, do not run provider mutation/index/watch/delete/reindex tools, do not use remote/destructive operations. Return concise findings with pass/fail and evidence gaps.

## Acceptance Contract

Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:

- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```
