# Presentation Generation Dependencies

Required Node packages:

- pptxgenjs: create PPTX decks.

Optional packages/tools:

- sharp: prepare and resize images before embedding.
- LibreOffice (`soffice` or `libreoffice`): convert PPTX to PDF.

## Native tool install (Debian/Ubuntu)

```bash
sudo apt-get install -y libreoffice
```

| apt package | provides                                        |
|-------------|-------------------------------------------------|
| libreoffice | `soffice` / `libreoffice` — PPTX → PDF conversion |

## Node install

```bash
./scripts/install-dependencies.sh
./scripts/check-dependencies.sh
```
