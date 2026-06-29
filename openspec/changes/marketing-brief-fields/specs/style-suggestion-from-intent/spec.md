## ADDED Requirements

### Requirement: Style suggestion badge shown in StyleControls
The system SHALL display a small "Gợi ý" badge next to the mood selector and style selector in `StyleControls` when the current `marketingBrief.campaignIntents[0]` has a known suggestion that differs from the current StyleControls value. The badge MUST NOT appear if the user's current selection already matches the suggestion.

#### Scenario: Badge appears when suggestion differs from current value
- **WHEN** user selects intent `flash-sale` (suggests mood: energetic, style: bold)
- **AND** current StyleControls has mood: `calm`
- **THEN** a "Gợi ý: Năng động" badge appears next to the mood selector

#### Scenario: Badge absent when already matching
- **WHEN** user selects intent `flash-sale` (suggests mood: energetic)
- **AND** current StyleControls already has mood: `energetic`
- **THEN** no badge appears next to the mood selector

#### Scenario: Badge absent when no intent selected
- **WHEN** `marketingBrief.campaignIntents` is empty
- **THEN** no suggestion badges appear anywhere in StyleControls

#### Scenario: Badge reflects first intent only
- **WHEN** user selects multiple intents `["event", "flash-sale"]`
- **THEN** suggestion is derived from `intents[0]` = `event` (suggests mood: festive, style: playful)

---

### Requirement: User applies suggestion via badge click
The system SHALL update StyleControls when user clicks a suggestion badge. The badge MUST disappear after the click because the current value now matches the suggestion.

#### Scenario: Click mood badge applies mood
- **WHEN** user clicks "Gợi ý: Năng động" badge next to mood selector
- **THEN** `styleControls.mood` is set to `energetic`
- **AND** the badge disappears

#### Scenario: Click style badge applies style
- **WHEN** user clicks "Gợi ý: Đậm nét" badge next to style selector
- **THEN** `styleControls.style` is set to `bold`
- **AND** the badge disappears

---

### Requirement: Suggestion does not auto-apply without user action
The system SHALL NOT automatically change `styleControls.mood` or `styleControls.style` when user selects a campaign intent. StyleControls values MUST only change through explicit user action (badge click or direct selector change).

#### Scenario: Intent selection does not mutate StyleControls
- **WHEN** user clicks the `flash-sale` chip
- **THEN** `styleControls.mood` and `styleControls.style` remain unchanged
- **AND** only the suggestion badge appears as a nudge

#### Scenario: Manual StyleControls override is preserved
- **WHEN** user has manually set mood: `calm` for a luxury brand flash-sale
- **AND** the suggestion badge for `energetic` is visible
- **THEN** user can ignore the badge and generate — mood: `calm` is used in the prompt

---

### Requirement: Suggestion mapping
The system SHALL use the following intent → suggestion mapping (first intent in array wins):

| Intent | Mood suggestion | Style suggestion |
|---|---|---|
| `flash-sale` | `energetic` | `bold` |
| `product-launch` | `professional` | `luxury` |
| `brand-awareness` | `calm` | `minimalist` |
| `event` | `festive` | `playful` |

#### Scenario: All four intents have known suggestions
- **WHEN** any single intent from the table is selected as `intents[0]`
- **THEN** the corresponding mood and style suggestions are surfaced as badges (if they differ from current values)
