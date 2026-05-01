# PDF Studio

A small local web app for PDF page operations:

- Replace specific pages in one PDF with pages from another PDF
- Merge multiple PDF files into one
- Split a PDF by page ranges

## License

MIT. See the LICENSE file for details.

## Run locally

```bash
npm install
npm start
```

The server prefers port 3000 and falls back automatically if that port is unavailable. Use the URL printed in the terminal.

## Example

If your base PDF has 20 pages and you want to replace page 15 with page 1 from another PDF and page 20 with page 2, add two replacement rows:

- Target page `15`, source page `1`
- Target page `20`, source page `2`
