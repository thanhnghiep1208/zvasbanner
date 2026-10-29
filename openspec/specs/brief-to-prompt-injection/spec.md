# Spec: Brief-to-Prompt Injection

## Purpose

Defines how marketing brief fields (`campaignIntents`, `focalSubjects`) are injected into the AI prompt layers during banner generation (`lib/prompt-builder.ts`). Applies to both the form and Flow canvas (Flow builds the same `GenerationRequest` via `lib/flow/legacy/to-legacy-config.ts`). There is no industry field: Layer 2 (`buildContextBlock`) receives nothing from the brief.

## Requirements

### Requirement: Campaign intent injected into Layer 3
The system SHALL append a campaign intent phrase to `buildStylePhrase()` output for each selected intent, joined with ` + ` when multiple. If `marketingBrief.campaignIntents` is empty, nothing is appended.

#### Scenario: Single intent injected
- **WHEN** `marketingBrief.campaignIntents` contains `["flash-sale"]`
- **THEN** Layer 3 contains: `Campaign intent: Urgency-forward composition: bold discount callout prominent, high-contrast warm accent color, time-pressure visual energy, eye-catching over refined.`

#### Scenario: Multiple intents concatenated
- **WHEN** `marketingBrief.campaignIntents` contains `["flash-sale", "event"]`
- **THEN** Layer 3 contains both phrases joined: `Campaign intent: <flash-sale phrase> + <event phrase>`

#### Scenario: No intent — nothing appended
- **WHEN** `marketingBrief.campaignIntents` is empty
- **THEN** Layer 3 output is identical to current behavior (no campaign intent line)

---

### Requirement: Focal subject injected into Layer 3
The system SHALL append a focal subject directive to `buildStylePhrase()` output for each selected focal subject. Multiple selections are joined with `, `. If `marketingBrief.focalSubjects` is empty, nothing is appended.

#### Scenario: Single focal subject injected
- **WHEN** `marketingBrief.focalSubjects` contains `["product"]`
- **THEN** Layer 3 contains: `Focal subject: Product must be the dominant subject: 55–70% of frame area, hero-lit from front-top, clean visual separation from background, no competing focal points.`

#### Scenario: Multiple focal subjects injected
- **WHEN** `marketingBrief.focalSubjects` contains `["product", "text"]`
- **THEN** Layer 3 contains both focal phrases joined with `, `

#### Scenario: No focal — nothing appended
- **WHEN** `marketingBrief.focalSubjects` is empty
- **THEN** Layer 3 output is identical to current behavior

---

### Requirement: Backward compatibility when brief is absent
The system SHALL produce identical prompt output when `marketingBrief` is undefined or all fields are empty arrays, compared to before this feature existed.

#### Scenario: Undefined brief
- **WHEN** `GenerationRequest.marketingBrief` is `undefined`
- **THEN** `assembleFullPrompt()` output is byte-for-byte identical to pre-feature output

#### Scenario: All-empty brief
- **WHEN** `marketingBrief` is `{ campaignIntents: [], focalSubjects: [] }`
- **THEN** `assembleFullPrompt()` output is byte-for-byte identical to pre-feature output
