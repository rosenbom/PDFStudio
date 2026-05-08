import express from 'express';
import JSZip from 'jszip';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function parsePageNumber(value, label) {
  const pageNumber = Number.parseInt(value, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return pageNumber;
}

function buildSplitFileName(originalName, start, end) {
  const parsedPath = path.parse(originalName || 'document.pdf');
  const baseName = parsedPath.name || 'document';
  return `${baseName}_${start}-${end}.pdf`;
}

function normalizeSplitRanges(sourcePageCount, ranges, chunkSize, autoCompleteFinalChunk) {
  if (chunkSize !== undefined && chunkSize !== null && String(chunkSize).trim() !== '') {
    const normalizedChunkSize = parsePageNumber(chunkSize, 'Chunk size');
    const generatedRanges = [];

    for (let start = 1; start <= sourcePageCount; start += normalizedChunkSize) {
      generatedRanges.push({
        start,
        end: Math.min(start + normalizedChunkSize - 1, sourcePageCount)
      });
    }

    return generatedRanges;
  }

  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error('At least one page range is required.');
  }

  const normalizedRanges = ranges.map((range) => {
    const start = parsePageNumber(range.start, 'Range start');
    const end = parsePageNumber(range.end, 'Range end');

    if (end < start) {
      throw new Error(`Invalid range ${start}-${end}.`);
    }

    if (end > sourcePageCount) {
      throw new Error(`Source PDF does not contain page ${end}.`);
    }

    return { start, end };
  }).sort((left, right) => left.start - right.start);

  for (let index = 1; index < normalizedRanges.length; index += 1) {
    const previousRange = normalizedRanges[index - 1];
    const currentRange = normalizedRanges[index];

    if (currentRange.start <= previousRange.end) {
      throw new Error(`Ranges ${previousRange.start}-${previousRange.end} and ${currentRange.start}-${currentRange.end} overlap.`);
    }
  }

  if (autoCompleteFinalChunk && normalizedRanges.length > 0) {
    const lastRange = normalizedRanges[normalizedRanges.length - 1];

    if (lastRange.end < sourcePageCount) {
      normalizedRanges.push({
        start: lastRange.end + 1,
        end: sourcePageCount
      });
    }
  }

  return normalizedRanges;
}

app.post('/api/process', upload.fields([
  { name: 'basePdf', maxCount: 1 },
  { name: 'replacementPdf', maxCount: 1 }
]), async (req, res) => {
  try {
    const basePdfFile = req.files?.basePdf?.[0];
    const replacementPdfFile = req.files?.replacementPdf?.[0];
    const operations = JSON.parse(req.body.operations ?? '[]');

    if (!basePdfFile) {
      return res.status(400).json({ error: 'Base PDF is required.' });
    }

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: 'At least one operation is required.' });
    }

    const basePdf = await PDFDocument.load(basePdfFile.buffer);
    const outputPdf = await PDFDocument.create();
    const basePageCount = basePdf.getPageCount();
    const replacementPdf = replacementPdfFile ? await PDFDocument.load(replacementPdfFile.buffer) : null;
    const normalizedOperations = operations.map((operation) => ({
      targetPage: parsePageNumber(operation.targetPage, 'Target page'),
      sourcePage: parsePageNumber(operation.sourcePage, 'Source page')
    }));
    const seenTargetPages = new Set();

    for (const operation of normalizedOperations) {
      if (operation.targetPage > basePageCount) {
        throw new Error(`Base PDF does not contain page ${operation.targetPage}.`);
      }

      if (seenTargetPages.has(operation.targetPage)) {
        throw new Error(`Target page ${operation.targetPage} is listed more than once.`);
      }

      seenTargetPages.add(operation.targetPage);

      if (!replacementPdf) {
        throw new Error('Replacement PDF is required when replacement operations are provided.');
      }

      if (operation.sourcePage > replacementPdf.getPageCount()) {
        throw new Error(`Replacement PDF does not contain page ${operation.sourcePage}.`);
      }
    }

    for (let index = 0; index < basePageCount; index += 1) {
      const matchingOperation = normalizedOperations.find((operation) => operation.targetPage === index + 1);

      if (matchingOperation) {
        const [replacementPage] = await outputPdf.copyPages(replacementPdf, [matchingOperation.sourcePage - 1]);
        outputPdf.addPage(replacementPage);
      } else {
        const [basePage] = await outputPdf.copyPages(basePdf, [index]);
        outputPdf.addPage(basePage);
      }
    }

    const pdfBytes = await outputPdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="processed.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to process PDF.' });
  }
});

app.post('/api/merge', upload.array('pdfs', 10), async (req, res) => {
  try {
    const files = req.files ?? [];

    if (files.length < 2) {
      return res.status(400).json({ error: 'At least two PDF files are required to merge.' });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const pdf = await PDFDocument.load(file.buffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to merge PDFs.' });
  }
});

app.post('/api/split', upload.single('pdf'), async (req, res) => {
  try {
    const file = req.file;
    const ranges = JSON.parse(req.body.ranges ?? '[]');
    const splitMode = req.body.splitMode;
    const chunkSize = splitMode === 'chunkSize'
      ? req.body.chunkSize
      : (String(req.body.chunkSize ?? '').trim() === '' ? undefined : req.body.chunkSize);
    const autoCompleteFinalChunk = req.body.autoCompleteFinalChunk === 'true';

    if (!file) {
      return res.status(400).json({ error: 'A PDF file is required.' });
    }

    const sourcePdf = await PDFDocument.load(file.buffer);
    const zip = new JSZip();
    const normalizedRanges = normalizeSplitRanges(
      sourcePdf.getPageCount(),
      ranges,
      chunkSize,
      autoCompleteFinalChunk
    );

    for (const range of normalizedRanges) {
      const splitPdf = await PDFDocument.create();
      const { start, end } = range;
      const pageIndexes = Array.from({ length: end - start + 1 }, (_, offset) => start + offset - 1);
      const pages = await splitPdf.copyPages(sourcePdf, pageIndexes);
      pages.forEach((page) => splitPdf.addPage(page));
      const pdfBytes = await splitPdf.save();
      zip.file(buildSplitFileName(file.originalname, start, end), pdfBytes);
    }

    const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });
    const archiveName = `${path.parse(file.originalname || 'split').name || 'split'}_split.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
    return res.send(zipBytes);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to split PDF.' });
  }
});

const preferredPort = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = '127.0.0.1';

function startServer(port) {
  const server = app.listen(port, host, () => {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : port;
    console.log(`PDF app listening on http://${host}:${activePort}`);
  });

  server.on('error', (error) => {
    if ((error.code === 'EACCES' || error.code === 'EADDRINUSE') && port === preferredPort) {
      startServer(0);
      return;
    }

    throw error;
  });
}

startServer(preferredPort);