# Spreadsheet Generation Dependencies

Required Python packages:

- openpyxl: create, style, and edit XLSX workbooks.
- pandas: transform tabular data and export datasets.

Optional packages/tools:

- xlsx: portable JavaScript XLSX export.
- LibreOffice (`soffice` or `libreoffice`): recalculate formulas and export PDFs.

## Native tool install (Debian/Ubuntu)

```bash
sudo apt-get install -y libreoffice
```

| apt package | provides                                        |
|-------------|-------------------------------------------------|
| libreoffice | `soffice` / `libreoffice` — formula recalc and PDF export |

## Node / Python install

```bash
./scripts/install-dependencies.sh
./scripts/check-dependencies.sh
```
