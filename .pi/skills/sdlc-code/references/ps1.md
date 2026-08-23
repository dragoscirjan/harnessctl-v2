# PowerShell

- Follow the declared PowerShell edition and version; Windows PowerShell and modern PowerShell have different compatibility constraints.
- Use approved verbs and output objects rather than presentation strings for reusable commands.
- Use `[CmdletBinding()]` for advanced functions when cmdlet semantics are needed. Use `#Requires` only for genuine prerequisites.
- Make terminating and non-terminating error behavior explicit; use `-ErrorAction Stop` where `try`/`catch` must handle a command failure.
- Preserve pipeline behavior, parameter binding, and `ShouldProcess` semantics for mutating commands.
- Use configured PSScriptAnalyzer and Pester commands; do not introduce modules without scope approval.
