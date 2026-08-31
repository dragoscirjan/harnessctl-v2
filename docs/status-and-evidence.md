# Feature status and evidence

A feature label answers two separate questions: does the feature exist, and what
currently proves that it behaves as described? Read the status and evidence together;
color and icons never carry the meaning by themselves.

Feature entries use this format:

```markdown
**Status:** `working`

**Evidence:** Automated test: configuration validation suite; active configuration:
`.harnessctl/config.yaml`.
```

## Page conventions

Public pages begin with one descriptive level-one heading and a short statement of
purpose. Headings describe user goals or reference subjects so generated anchors remain
stable and useful when linked directly. Do not skip heading levels.

Put evidence beside the claim it supports rather than in a detached bibliography. Use
descriptive link text, identify the evidence class in plain text, and link to the
narrowest current authority. Guides explain decisions and workflows; reference pages
own exact fields, defaults, options, and command contracts.

Keep tables focused enough to remain readable on narrow screens. When a wide table is
unavoidable, introduce its columns in prose. Label fenced code with its language and
include the important result or meaning outside the code block.

## Accessible presentation

Status and evidence meaning remains present in text when styles, color, icons, or
client-side behavior are unavailable. Keyboard focus must remain visible. Diagrams need
an accessible title and description plus nearby prose that communicates the same
essential meaning.

These conventions define presentation only. The Epic that owns a page remains
responsible for every product-specific capability, support, and completeness claim.

## Status labels

Each independently testable claim uses exactly one label.

| Status                  | Use it when                                                                                                       | Do not imply                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `working`               | The implementation exists and current, relevant verification covers the described behavior.                       | That untested variants, providers, hosts, or platforms also work.                     |
| `working but untested`  | The implementation exists, but no current relevant verification was found.                                        | That inspection or active configuration proves runtime success.                       |
| `partially implemented` | Some described behavior exists, but confirmed parts of the same claim are missing or do not satisfy the contract. | That the available subset represents the complete feature.                            |
| `not implemented`       | Current evidence establishes intended or explicitly described behavior, and no implementation exists.             | That a non-goal, rejected idea, or unsupported third-party behavior is promised work. |
| `unknown/stale`         | Evidence is missing, contradictory, unavailable, or too old to support a current claim.                           | That the feature is broken or absent.                                                 |

`working` is deliberately narrow. A passing configuration check, for example,
supports the inputs covered by that check. It does not prove every provider
integration that can consume the configuration.

## Evidence classes

The evidence line names the narrowest authority that supports the claim.

| Evidence class             | What it establishes                                                               | Main limitation                                                |
| -------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Source                     | Current implementation exists and shows its behavior.                             | Inspection alone does not prove execution succeeds.            |
| Generated contract         | A generated default, schema, or projection contains the stated contract.          | It proves generated output, not external provider behavior.    |
| Automated test             | The checked behavior passed under the test's stated inputs and environment.       | Coverage is limited to those inputs and assertions.            |
| Approved design            | Maintainers approved an intended boundary or behavior.                            | Intent is not implementation.                                  |
| Active configuration       | The current project declares or enables a setting.                                | Declaration is not successful provider startup or operation.   |
| Dated provider observation | A named provider/version exhibited the recorded behavior on the observation date. | External behavior can change independently of this repository. |

A useful evidence line is compact but specific:

```markdown
**Evidence:** Generated contract: Config v1 schema; automated test: configuration
validation suite; active configuration: `.harnessctl/config.yaml`.
```

Do not use an approved design as proof that code exists. Active configuration does
not prove successful provider operation: an enabled MCP entry does not establish that
its process started, authenticated, or returned correct data.

## Freshness and conflicts

Source, generated contracts, tests, designs, and active configuration are current only
when they describe the version you are using. Provider evidence must also state the
provider identity or version and an observation date.

Use `unknown/stale` when you cannot establish that relationship. This includes a
provider result without a date, a test for an older contract, or two authorities that
disagree. Do not average conflicting evidence into a stronger label. Narrow the claim
to the part the evidence supports, or resolve the conflict first.

When evidence proves that only part of an intended claim exists, use `partially
implemented` instead. When the intended behavior is clear and current inspection
confirms that no implementation exists, use `not implemented`.

## How to use the evidence

Use the evidence boundary when deciding whether a feature is suitable for your case.
An automated test for one host does not cover another host. A generated contract does
not prove that an external provider started successfully. A dated provider observation
can become stale even when harnessctl itself has not changed.

When a claim is `working but untested`, test it in a non-production project before
depending on it. When it is `partially implemented`, confirm that the available subset
is enough for your workflow. Treat `unknown/stale` as a reason to gather current
evidence, not as proof that the feature is broken.
