# PDF Processing Dependencies

Required Node packages:

- pdf-lib: merge, split, forms, overlays, and PDF metadata.

Required Python packages:

- pypdf: merge, split, page operations, metadata, encryption handling.
- pdfplumber: extract text and tables.
- reportlab: generate PDF pages/reports.

Optional packages/tools:

- @pdf-lib/fontkit: custom fonts for pdf-lib.
- pytesseract and Tesseract: OCR for scanned PDFs.
- LibreOffice: Office document conversion to PDF.
- Poppler utilities (`pdftotext`, `pdfinfo`, `pdftoppm`): extraction and preview utilities.
- qpdf: repair, inspect, decrypt, and structural operations.

## Native tool install (Debian/Ubuntu)

```bash
sudo apt-get install -y libreoffice poppler-utils qpdf tesseract-ocr
```

| apt package     | provides                              |
|-----------------|---------------------------------------|
| libreoffice     | `soffice` / `libreoffice` — DOCX/PPTX/XLSX → PDF |
| poppler-utils   | `pdftotext`, `pdfinfo`, `pdftoppm`    |
| qpdf            | `qpdf` — repair, inspect, decrypt     |
| tesseract-ocr   | `tesseract` — OCR for scanned PDFs    |

## Node / Python install

```bash
./scripts/install-dependencies.sh
./scripts/check-dependencies.sh
```
