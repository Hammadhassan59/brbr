/**
 * PDF helpers for the tenant data-export route. Wraps pdfkit with a
 * narrower API tailored to the kind of report we ship: cover page with
 * meta, section headers, simple key/value lists, and tabular data.
 *
 * pdfkit is used server-side only (Node.js) inside an API route. We pipe
 * the output through a PassThrough so the route can return it as a
 * Web ReadableStream.
 */

import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

export interface PDFColumn {
  key: string;
  label: string;
  width: number;          // proportion of available width (0–1)
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown) => string;
}

export class ReportPDF {
  doc: InstanceType<typeof PDFDocument>;
  stream: PassThrough;

  constructor() {
    this.doc = new PDFDocument({ margin: 36, size: 'A4' });
    this.stream = new PassThrough();
    this.doc.pipe(this.stream);
  }

  cover(opts: { title: string; subtitle?: string; meta: Array<[string, string]> }) {
    this.doc.fontSize(28).fillColor('#000').text(opts.title, { align: 'center' });
    if (opts.subtitle) {
      this.doc.moveDown(0.5).fontSize(12).fillColor('#666').text(opts.subtitle, { align: 'center' });
    }
    this.doc.moveDown(2);
    for (const [k, v] of opts.meta) {
      this.doc
        .fontSize(10).fillColor('#888').text(k, { continued: true })
        .fontSize(10).fillColor('#000').text(`  ${v}`);
    }
    this.doc.moveDown(2);
  }

  section(title: string) {
    if (this.doc.y > 720) this.doc.addPage();
    this.doc
      .moveDown(1)
      .fontSize(16).fillColor('#000').text(title)
      .moveTo(this.doc.page.margins.left, this.doc.y + 2)
      .lineTo(this.doc.page.width - this.doc.page.margins.right, this.doc.y + 2)
      .strokeColor('#d4af37').lineWidth(1).stroke()
      .moveDown(0.8);
  }

  kv(rows: Array<[string, string]>) {
    for (const [k, v] of rows) {
      const startY = this.doc.y;
      this.doc.fontSize(10).fillColor('#888').text(k, this.doc.page.margins.left, startY, { width: 140 });
      this.doc.fontSize(10).fillColor('#000').text(v, this.doc.page.margins.left + 150, startY, {
        width: this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right - 150,
      });
      this.doc.moveDown(0.4);
    }
  }

  paragraph(text: string) {
    this.doc.fontSize(10).fillColor('#444').text(text, { lineGap: 2 });
    this.doc.moveDown(0.5);
  }

  table<T extends Record<string, unknown>>(rows: T[], columns: PDFColumn[], opts?: { emptyText?: string }) {
    if (rows.length === 0) {
      this.doc.fontSize(10).fillColor('#888').text(opts?.emptyText ?? 'No data.');
      this.doc.moveDown(0.5);
      return;
    }
    const margin = this.doc.page.margins.left;
    const tableWidth = this.doc.page.width - margin - this.doc.page.margins.right;
    const cellPadding = 4;
    const widths = columns.map((c) => c.width * tableWidth);

    const drawRow = (cells: string[], options: { header?: boolean } = {}) => {
      const startY = this.doc.y;
      const isHeader = options.header ?? false;
      let x = margin;
      const lineHeights: number[] = [];
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const w = widths[i];
        this.doc
          .fontSize(isHeader ? 9 : 9)
          .fillColor(isHeader ? '#000' : '#222')
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica');
        const txt = cells[i] ?? '';
        const h = this.doc.heightOfString(txt, { width: w - cellPadding * 2, align: col.align ?? 'left' });
        lineHeights.push(h);
        this.doc.text(txt, x + cellPadding, startY + 3, {
          width: w - cellPadding * 2,
          align: col.align ?? 'left',
        });
        x += w;
      }
      const rowHeight = Math.max(...lineHeights) + 8;
      // Bottom border
      this.doc
        .moveTo(margin, startY + rowHeight)
        .lineTo(margin + tableWidth, startY + rowHeight)
        .strokeColor(isHeader ? '#d4af37' : '#eee').lineWidth(0.5).stroke();
      this.doc.y = startY + rowHeight;
      // Page break if near bottom
      if (this.doc.y > 760) this.doc.addPage();
    };

    drawRow(columns.map((c) => c.label), { header: true });
    for (const row of rows) {
      const cells = columns.map((c) => {
        const v = row[c.key];
        if (c.format) return c.format(v);
        if (v == null) return '';
        return String(v);
      });
      drawRow(cells);
    }
    this.doc.moveDown(0.5);
  }

  footer(text: string) {
    if (this.doc.y > 740) this.doc.addPage();
    this.doc
      .moveDown(2)
      .fontSize(8).fillColor('#888').text(text, { align: 'center' });
  }

  /** Finish the document and return a Web ReadableStream of the bytes. */
  finish(): ReadableStream<Uint8Array> {
    this.doc.end();
    const stream = this.stream;
    return new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });
  }
}
