# Local contribution discussion notes

The public embassy function explorer has a working discussion-note form. It uses the same validated v0.2 proposal snapshot as the read-only overview. It does not submit a review, approve an account or enroll a reviewer.

## Interaction and lifetime

- Select one of the 36 proposal relations, or use its **Schrijf een notitie** button.
- Each relation has a separate draft held in the current page's memory. Switching relations saves that draft and restores the selected relation's existing draft, or starts an empty one.
- Function filtering and interface-language changes preserve the form's relation binding and user-written text. They do not silently move prose to another relation.
- Argument is required. Argument, references, concerns and dissent have a 2,000 UTF-16 code-unit limit; the reopening condition has a 1,000 limit. Empty or whitespace-only arguments, unknown relation IDs/outcomes, oversized fields and unavailable data reject export.
- **Download bespreeknotitie** downloads only the current draft as JSON. Downloading leaves the draft available. **Wis deze notitie** clears only that relation's draft, preserving other drafts.
- Drafts have no application persistence. No note content is sent to a server or written to localStorage, sessionStorage or IndexedDB. The form disables autocomplete. Reloading starts a new set of drafts; users must download each note they want to retain. The existing language preference is separate.

## Source and meaning

Exports use schema `palaco-contribution-discussion-note/0.1` and record type `LOCAL_DISCUSSION_DRAFT`. They include the selected relation, source version/bindings, exact Dutch source reason and shared row context, interface language, local creation time, the user's text and a discussion estimate.

The proposal is v0.2 from [Issue #38](https://github.com/Maurits-pixe/PALACO-Citadel/issues/38), core Git blob `2293d1f957b4b69c99676824fe64fd9b62ad2333`, with the historical source and records in #37/#33. The public data is a snapshot dated 12 October 2026. Translations aid reading; the export keeps the bound Dutch source context regardless of the chosen interface language.

Discussion estimates are `IN_DOUBT`, `USABLE_FOR_DISCUSSION`, `CHANGE_SUGGESTED`, `INSUFFICIENT_SUPPORT` and `DISPUTED`. Changing an estimate retains concerns and dissent. None is an independent review or acceptance outcome.

Reviewer identity stays `UNVERIFIED`, eligibility `NOT_ESTABLISHED` and conflict status `UNKNOWN`. Independent acceptance, ratification, appointment, safety approval, account access, merge, release and execution are all false. The timestamp and source references identify a local draft; they are not signatures or evidence of reviewer identity. Exports can be edited by their recipients and must be treated as untrusted discussion data.

## Runtime boundary

The form is hidden until the proposal snapshot passes validation. The loader hashes the exact JSON response bytes with SHA-256 and requires the committed snapshot digest `a0bec5d1eca6a0f73b855d833d691ad4dfaac1d581c831fd33fd8d06be53af2a` before using any source text. Changed reason/portfolio/content is rejected even if v0.2 metadata is copied. Missing Web Crypto leaves the saved read-only proposal visible and the form closed. Its submit handler is attached before it becomes visible, cancels native submission and verifies the selected binding and input again before creating the download. UI rendering uses DOM nodes/textContent, and export uses JSON serialization; user text is never executed or interpreted as markup.

The existing account-safety HOLD and NOVA/contact controls are unchanged. No API, account, seat appointment, reviewer registry or governance status is modified by the form.
