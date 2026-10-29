# Spec: Marketing Brief Input

## Purpose

Defines the UI for capturing marketing brief metadata (campaign intent, focal subject) through chip selection in `PromptInput` (`components/prompt/MarketingBriefChips.tsx`), and how that state is stored and displayed. `MarketingBrief` (`lib/types.ts`) has exactly two fields: `campaignIntents` and `focalSubjects`. The industry chip group ("Ngành") from the original change was not kept.

## Requirements

### Requirement: Campaign intent chip selection
The system SHALL display a multi-select chip group labeled "Mục tiêu banner" inside `PromptInput`, above the textarea. Options (label has an emoji prefix): ⚡ Flash sale (`flash-sale`), 🚀 Ra mắt sản phẩm (`product-launch`), 💡 Nhận thức thương hiệu (`brand-awareness`), 🎉 Sự kiện / Ngày lễ (`event`). All chips are optional; zero selected is valid. Chips are disabled while a generation is running.

#### Scenario: Select single intent
- **WHEN** user clicks one intent chip
- **THEN** that chip becomes visually active and its value is added to `marketingBrief.campaignIntents`

#### Scenario: Select multiple intents
- **WHEN** user clicks a second intent chip while one is already active
- **THEN** both chips are active and both values exist in `marketingBrief.campaignIntents`

#### Scenario: Deselect intent
- **WHEN** user clicks an already-active intent chip
- **THEN** that chip becomes inactive and its value is removed from `marketingBrief.campaignIntents`

#### Scenario: No intent selected
- **WHEN** user generates without selecting any intent chip
- **THEN** generation proceeds normally with no campaign intent phrase injected into the prompt

---

### Requirement: Focal subject chip selection
The system SHALL display a multi-select chip group labeled "Nhân vật chính" inside `PromptInput`, below campaign intent chips. Options (label has an emoji prefix): 📦 Sản phẩm (`product`), 👤 Người / Model (`person`), ✍️ Text / Thông điệp (`text`), 🌆 Không gian (`scene`). All optional.

#### Scenario: Select focal subject
- **WHEN** user clicks a focal subject chip
- **THEN** chip becomes active and value is added to `marketingBrief.focalSubjects`

#### Scenario: Multi-select focal subjects
- **WHEN** user selects more than one focal subject
- **THEN** all selected values are stored and all corresponding phrases will be injected

#### Scenario: No focal selected
- **WHEN** user generates without selecting any focal chip
- **THEN** generation proceeds with no focal directive injected

---

### Requirement: Pill summary feedback
The system SHALL display a compact pill summary below the textarea showing the active brief selections. The pill MUST be hidden when both fields are empty. Values use short lowercase labels: intents `flash sale`, `ra mắt SP`, `nhận thức TH`, `sự kiện`; focal subjects `sản phẩm`, `người`, `text`, `không gian`. Intents come first, then focal subjects.

#### Scenario: Pill appears on first selection
- **WHEN** user activates at least one chip across any field
- **THEN** a pill appears below the textarea showing the selected values separated by ` · `

#### Scenario: Pill updates on change
- **WHEN** user adds or removes a chip selection
- **THEN** pill content updates immediately to reflect current selections

#### Scenario: Pill hidden when empty
- **WHEN** all chip fields are deselected (empty state)
- **THEN** no pill is rendered (no empty placeholder)

#### Scenario: Pill content format
- **WHEN** user has selected: Flash sale + Ra mắt sản phẩm + Sản phẩm
- **THEN** pill shows: `flash sale · ra mắt SP · sản phẩm`

---

### Requirement: Brief state persists within session
The system SHALL store `marketingBrief` in the Zustand editor store so selections persist across regenerations within the same browser session.

#### Scenario: Brief survives regeneration
- **WHEN** user generates a banner then modifies the prompt and generates again
- **THEN** chip selections remain unchanged unless user explicitly deselects them

#### Scenario: Brief resets on page reload
- **WHEN** user reloads the page
- **THEN** all chip selections reset to empty (no localStorage persistence in v1)
