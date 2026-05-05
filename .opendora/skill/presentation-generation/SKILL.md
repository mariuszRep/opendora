---
name: presentation-generation
description: Create, edit, storyboard, and export user-outcome presentations such as pitch decks, slide summaries, training decks, and visual narratives as PPTX with optional PDF export.
origin: opendora
---

# Presentation Generation

Use this skill when the user asks for a presentation outcome such as a pitch deck, slide deck, executive summary, lesson deck, visual story, webinar slides, board update, or speaker-support artifact. Treat `.pptx` and PDF as output formats, not the reason to load the skill.

## Objective

- Turn user goals into coherent slide narratives.
- Generate PPTX files with consistent layouts, slide hierarchy, visual density, and speaker intent.
- Export to PDF when requested or when preview/final delivery requires it.

## Inputs

- Audience, purpose, and desired call to action
- Source material, data, images, brand constraints, and slide count
- Tone, visual direction, and delivery context
- Desired outputs: PPTX, PDF, or both
- Existing deck/template, if provided

## Workflow

1. Classify presentation intent: pitch, report, training, summary, proposal, sales, board, or custom.
2. Create a storyboard before generating files: title, narrative arc, slide-by-slide message, evidence, and CTA.
3. Choose the creation lane:
   - New deck generation: use `pptxgenjs`.
   - Template-driven deck: use an existing PPTX template when provided.
   - Data-heavy slides: create charts/tables using the spreadsheet or charting workflow first, then embed results.
4. Generate slides with reusable layouts, typography, spacing, and visual hierarchy.
5. Keep text concise and scannable; put detail into speaker notes or appendix slides when useful.
6. Validate that slide count, titles, key messages, and requested assets are present.
7. Use LibreOffice or the PDF processing skill for PDF export and preview generation.

## Recommended Dependencies

- Node: `pptxgenjs`
- Optional Node: `sharp` or browser rendering tools for image preparation when available
- Native optional: LibreOffice for PPTX to PDF conversion

## Rules

- Design around the communication outcome, not `.pptx` as a file type.
- Every slide must have one clear job.
- Avoid dense paragraphs on slides; use hierarchy, charts, diagrams, and speaker notes.
- Do not imitate protected brand styles unless the user has provided authorized brand assets or generic direction.
- Never claim PDF export or visual rendering succeeded unless a command actually ran.
- Hand off merge, split, extraction, annotation, or final preview operations to the PDF processing skill.

## Verification Checklist

- PPTX exists at the reported path.
- Slide count and slide titles match the storyboard.
- Required assets/data are included or explicitly reported missing.
- Deck opens or parses without generation errors.
- PDF export exists if requested.