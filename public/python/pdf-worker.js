// In-scope ES module worker proxy for pdf.js on /python/main.
// WebKit only lets /python/coi-sw.js intercept worker scripts inside its /python/ scope,
// so routing pdf.js through this proxy ensures COEP/CORP headers are attached cleanly.
import '/pdfjs/pdf.worker.min.mjs';
