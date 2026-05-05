---
name: pdf-processing
description: Process, finalize, inspect, merge, split, annotate, extract, OCR, convert, and preview PDFs as a utility layer for document, spreadsheet, and presentation workflows.
origin: opendora
---

# PDF Processing

Use this skill when the task is to finalize, convert, merge, split, extract, annotate, inspect, OCR, secure, repair, or preview PDFs. Also use it as the final processing layer after document, spreadsheet, or presentation generation when a PDF deliverable is required.

## Objective

- Provide a reliable PDF utility layer across artifact workflows.
- Convert office artifacts to PDF when supported by installed native tools.
- Perform PDF-native processing without conflating PDF with document generation.

## Inputs

- Source file paths and source formats
- Requested operation: convert, merge, split, extract, annotate, OCR, compress, secure, inspect, or preview
- Desired output path and naming convention
- Quality requirements such as page range, resolution, text fidelity, or metadata

## Workflow

1. Classify the PDF operation:
   - Conversion: DOCX/XLSX/PPTX/ODT/etc. to PDF.
   - Composition: merge, split, reorder, rotate, crop.
   - Extraction: text, tables, images, metadata, page thumbnails.
   - Annotation/fill: forms, stamps, overlays, flattening.
   - OCR: scanned PDFs or image-only pages.
2. Choose the processing lane:
   - Pure JS: use `pdf-lib` for merge, split, forms, overlays, and metadata.
   - Python: use `pypdf`, `pdfplumber`, and `reportlab` for extraction and generated PDFs.
   - Native tools: use LibreOffice, Poppler, qpdf, and Tesseract when available.
3. Check dependencies before running the operation; degrade gracefully and report exact missing tools.
4. Execute the requested operation with deterministic output paths.
5. Validate output existence, page count where relevant, and basic readability/extractability.
6. Return file paths, operation summary, dependency status, and any fidelity caveats.

## Recommended Dependencies

- Node: `pdf-lib`, optional `@pdf-lib/fontkit`
- Python: `pypdf`, `pdfplumber`, `reportlab`, optional `pytesseract`
- Native optional: LibreOffice, Poppler utilities, qpdf, Tesseract OCR

## Python Environment

This skill uses an isolated venv at `.venv/` inside the skill directory.

- **Always** invoke Python as `.venv/bin/python` (relative to this skill's root), never bare `python3`.
- If `.venv/` is missing, run `scripts/install-dependencies.sh` before any Python operation.
- Verify the environment is ready with `scripts/check-dependencies.sh`.

## Rules

- Treat PDF as a processing and finalization layer, not the authoring layer for rich editable documents.
- Do not use OCR unless text extraction fails or the user requests scanned-document handling.
- Never claim conversion, OCR, or repair succeeded unless the command completed and the output was verified.
- Preserve page order, metadata, and form behavior unless the user asks to change them.
- Report password, encryption, scanned-image, and malformed-PDF limitations explicitly.

## Verification Checklist

- Output file exists and is non-empty.
- Page count matches the operation expectation.
- Extracted text/table/image outputs are present when requested.
- Conversion output visually/fidelity caveats are stated if rendering could not be inspected.
- Missing optional native tools are reported with install guidance.