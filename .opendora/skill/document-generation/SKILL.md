---
name: document-generation
description: Create, edit, template, and export user-outcome documents such as reports, contracts, proposals, letters, notes, and briefs as DOCX with optional PDF finalization.
origin: opendora
---

# Document Generation

Use this skill when the user asks for a written deliverable such as a report, proposal, contract, memo, letter, brief, notes, policy, or other narrative document. Treat `.docx` and PDF as output formats, not the reason to load the skill.

## Objective

- Turn a user outcome into a structured, polished document artifact.
- Generate or update DOCX files using deterministic libraries and templates.
- Export to PDF when requested or when a final preview/download format is needed.

## Inputs

- User goal and audience
- Required sections, tone, length, and source material
- Existing template or source document, if provided
- Desired outputs: DOCX, PDF, or both
- Storage/output directory conventions for the current project

## Workflow

1. Classify the document intent: report, proposal, contract, memo, notes, brief, letter, policy, or custom.
2. Choose the creation lane:
   - New structured document: use `docx` for Node-based generation.
   - Template fill: use `docxtemplater` when a DOCX template has placeholders.
   - Advanced existing DOCX edits: inspect OOXML only when library-level editing is insufficient.
3. Draft a document outline before generating files: title, sections, tables, figures, appendices, and assumptions.
4. Generate the DOCX with explicit styles for headings, body, tables, lists, page breaks, headers/footers, and metadata.
5. Validate the result by opening/parsing the generated file or converting it to PDF when conversion tools are available.
6. If PDF is requested, use LibreOffice headless or the PDF processing skill as the finalization layer.
7. Report created file paths, conversion status, and any dependency limitations.

## Recommended Dependencies

- Node: `docx`, `docxtemplater`, `pizzip`
- Native optional: LibreOffice for DOCX to PDF conversion
- Optional validation: unzip/OOXML inspection tools available in the runtime

## Rules

- Design around the user deliverable, not `.docx` as a file type.
- Preserve source wording and legal/financial meaning when editing user-provided documents.
- Never claim PDF export succeeded unless a conversion command actually ran.
- Use templates when branding or layout matters more than generic generation.
- Keep generated content structured and editable; avoid flattening text into images.
- Hand off final PDF operations such as merging, splitting, annotations, extraction, or preview generation to the PDF processing skill.

## Verification Checklist

- The file exists at the reported path.
- The DOCX can be opened or parsed without errors.
- Required sections and tables are present.
- If PDF was requested, the PDF exists and reflects the DOCX content.
- Missing optional dependencies are reported with the exact install/check step.