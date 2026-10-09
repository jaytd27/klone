# Klone

An open-source, in-browser PDF editor built on [MuPDF.js](https://mupdf.readthedocs.io/).

> Status: early development.

## Features

- [x] View and render PDFs (thumbnails, zoom, fit width)
- [x] Page operations: reorder (drag and drop), rotate, delete, insert blank pages, insert/merge other PDFs, extract pages to a new PDF
- [x] Undo / redo
- [x] Annotations: highlight, underline, strikeout, sticky notes with comments, rectangles, ellipses, lines, arrows, freehand ink — with color, width and opacity, move and delete
- [ ] Form filling (AcroForm)
- [ ] Add text, images, signatures and watermarks
- [ ] True redaction (content is removed, not just covered)
- [ ] OCR for scanned documents (Tesseract.js)
- [ ] In-place editing of existing text

## Development

```sh
npm install
npm run dev
```

## License

Klone is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE), as required by its use of MuPDF.
