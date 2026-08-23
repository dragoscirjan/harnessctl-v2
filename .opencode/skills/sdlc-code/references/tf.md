# Terraform and OpenTofu

- Determine Terraform versus OpenTofu and supported versions from lockfiles, required-version constraints, CI, and repository commands.
- Use the matching configured formatter and validation workflow. Select existing analysis tools such as TFLint, tfsec, or Checkov rather than adding all alternatives.
- Keep modules cohesive, inputs validated, outputs intentional, and provider/module versions constrained according to repository policy.
- Preserve established file layout; `main.tf`, `variables.tf`, and `outputs.tf` are conventions, not mandatory one-concern files.
- Never commit state, plans containing sensitive values, or credentials. Preserve backend, locking, workspace, and state-migration procedures.
- Treat resource-address or state changes as potentially destructive and outside ordinary coding consent; do not apply them without explicit authorization.
