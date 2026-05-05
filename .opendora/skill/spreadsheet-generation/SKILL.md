---
name: spreadsheet-generation
description: Create, edit, calculate, import, and export user-outcome spreadsheets such as budgets, financial models, trackers, tables, and CSV/XLSX deliverables.
origin: opendora
---

# Spreadsheet Generation

Use this skill when the user asks for a spreadsheet outcome such as a budget, financial model, tracker, data table, CSV/XLSX export, calculation workbook, schedule, forecast, or analysis sheet. Treat `.xlsx` and CSV as output formats, not the skill boundary.

## Objective

- Turn tabular or calculation-heavy user goals into usable spreadsheet artifacts.
- Generate XLSX workbooks with clear sheets, formulas, formatting, validation, and metadata.
- Support CSV import/export and optional PDF final previews.

## Inputs

- User goal and spreadsheet type
- Source data, assumptions, formulas, and units
- Required sheets, columns, calculations, charts, and outputs
- Desired outputs: XLSX, CSV, PDF, or a combination
- Existing workbook/template, if provided

## Workflow

1. Classify spreadsheet intent: model, budget, tracker, table export, data cleanup, report workbook, or custom.
2. Choose the creation lane:
   - Python workbook generation/editing: use `openpyxl`.
   - Dataframe transformations: use `pandas` with `openpyxl` output.
   - JavaScript portable export: use `xlsx` for simple workbook creation.
3. Define workbook structure before generation: sheet names, columns, formulas, named assumptions, formatting, validations, and summary views.
4. Generate formulas rather than hardcoded outputs when the workbook must stay editable.
5. Apply readable formatting: frozen panes, widths, number formats, table styles, conditional formatting, and comments for assumptions.
6. Validate formulas and workbook structure. Use LibreOffice recalculation when available; otherwise state that formulas are stored but not recalculated in-process.
7. Export to CSV or PDF only when requested, using the PDF processing skill for final PDF handling.

## Recommended Dependencies

- Python: `openpyxl`, `pandas`
- Node: `xlsx`
- Native optional: LibreOffice for formula recalculation and PDF export

## Python Environment

This skill uses an isolated venv at `.venv/` inside the skill directory.

- **Always** invoke Python as `.venv/bin/python` (relative to this skill's root), never bare `python3`.
- If `.venv/` is missing, run `scripts/install-dependencies.sh` before any Python operation.
- Verify the environment is ready with `scripts/check-dependencies.sh`.

## Rules

- Design around the analytical outcome, not `.xlsx` as a file type.
- Separate inputs, calculations, and outputs when building models.
- Do not silently replace formulas with static values unless the user explicitly wants a static export.
- Preserve workbook formulas and sheets when editing existing files.
- Report calculation limitations when Excel/LibreOffice recalculation is unavailable.
- Avoid unsupported styling claims for the selected library.

## Verification Checklist

- Workbook exists at the reported path.
- Expected sheets, headers, formulas, and formatting are present.
- Numeric formats and units are clear.
- Formula recalculation status is known and reported.
- CSV/PDF exports exist if requested.