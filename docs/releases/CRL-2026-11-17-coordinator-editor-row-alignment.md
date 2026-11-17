# CRL-App release note: Coordinator Add Item row alignment
Date: 2026-11-17

## Reported issue
The Reading Coordinator's **Add Item** dialog displayed its Letter/Word input and the adjacent **Remove** button at different vertical positions. Labels and multirow controls were left-biased, and inline validation could worsen the visual mismatch.

## Root cause
The dialog is rendered into `document.body` using the shared `ClassDialog` portal. Some of the newer row CSS was incorrectly scoped beneath `.panel`, which is not an ancestor of the portalled dialog. The original markup also placed the input, label and validation text together in one label while Remove was a sibling flex item. As validation appeared, heights and alignment diverged.

## Targeted fix
- Each row has an explicit label above a **single centered control line** containing the letter/word input and optional Remove button.
- Live row errors sit below the controls in their own centered line and no longer offset buttons.
- Keep letter inputs compact at 68px and word inputs up to 260px; both are 46px high to match Remove.
- Center Add Another Row and the word-length hint. On narrow viewports, the word field shrinks while Remove retains its full tap target.
- Remove the incorrect `.panel` qualification for the portalled editor controls.
- Preserve labels via `htmlFor`/`id`, the 1-character uppercase/15-character word rules, case-insensitive duplicate checks, Add/Remove row behavior, draft discard, exact default selections, publication locks, and all assessment flows.

## Verification
The mandatory `scripts/verify-coordinator-item-editor.cjs` now checks the dialog's accessible row structure, centered control alignment, conditional validation placement, portal-safe selectors, input widths, responsive styles and existing functional invariants. Require a successful GitHub Actions production build before merging to Railway production.
