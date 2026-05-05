# Document Generation Dependencies

Required Node packages:

- docx: create new DOCX files.
- docxtemplater: fill DOCX templates.
- pizzip: read/write DOCX template zip containers for docxtemplater.

Optional native tools:

- LibreOffice (`soffice` or `libreoffice`): convert DOCX to PDF and validate rendering.

## Native tool install (Debian/Ubuntu)

```bash
sudo apt-get install -y libreoffice
```

| apt package | provides                                        |
|-------------|-------------------------------------------------|
| libreoffice | `soffice` / `libreoffice` — DOCX → PDF conversion |

## Node install

```bash
./scripts/install-dependencies.sh
./scripts/check-dependencies.sh
```
