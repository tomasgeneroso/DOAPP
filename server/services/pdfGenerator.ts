import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  dueDate?: Date;

  // Seller info
  sellerName: string;
  sellerEmail: string;
  sellerAddress?: string;
  sellerCuit?: string;

  // Buyer info
  buyerName: string;
  buyerEmail: string;
  buyerAddress?: string;
  buyerCuit?: string;

  // Items
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;

  // Totals
  subtotal: number;
  commission?: number;
  commissionRate?: number;
  tax?: number;
  taxRate?: number;
  total: number;
  currency: string;

  // Additional info
  notes?: string;
  paymentMethod?: string;
  transactionId?: string;
  contractId?: string;
  jobTitle?: string;
}

interface ReceiptData {
  receiptNumber: string;
  date: Date;

  userName: string;
  userEmail: string;

  description: string;
  amount: number;
  currency: string;

  paymentMethod: string;
  transactionId?: string;
  status: string;

  notes?: string;
}

class PDFGenerator {
  private readonly uploadsDir: string;
  private readonly invoicesDir: string;
  private readonly receiptsDir: string;

  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.invoicesDir = path.join(this.uploadsDir, 'invoices');
    this.receiptsDir = path.join(this.uploadsDir, 'receipts');

    // Ensure directories exist
    [this.invoicesDir, this.receiptsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Generate invoice PDF
   */
  async generateInvoice(data: InvoiceData): Promise<string> {
    return new Promise((resolve, reject) => {
      const filename = `invoice_${data.invoiceNumber}_${Date.now()}.pdf`;
      const filepath = path.join(this.invoicesDir, filename);

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('FACTURA', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').text(`Nº ${data.invoiceNumber}`, { align: 'center' });
      doc.moveDown(1);

      // Company info (DOAPP)
      doc.fontSize(14).font('Helvetica-Bold').text('DOAPP');
      doc.fontSize(10).font('Helvetica').text('Plataforma de Servicios Freelance');
      doc.text('Argentina');
      doc.moveDown(1);

      // Two columns: Seller and Buyer
      const startY = doc.y;

      // Seller column
      doc.fontSize(11).font('Helvetica-Bold').text('VENDEDOR:', 50, startY);
      doc.font('Helvetica').fontSize(10);
      doc.text(data.sellerName, 50, doc.y);
      doc.text(data.sellerEmail);
      if (data.sellerCuit) doc.text(`CUIT: ${data.sellerCuit}`);
      if (data.sellerAddress) doc.text(data.sellerAddress);

      // Buyer column
      doc.fontSize(11).font('Helvetica-Bold').text('COMPRADOR:', 300, startY);
      doc.font('Helvetica').fontSize(10);
      doc.text(data.buyerName, 300, startY + 15);
      doc.text(data.buyerEmail, 300);
      if (data.buyerCuit) doc.text(`CUIT: ${data.buyerCuit}`, 300);
      if (data.buyerAddress) doc.text(data.buyerAddress, 300);

      doc.y = Math.max(doc.y, startY + 80);
      doc.moveDown(1);

      // Dates
      doc.fontSize(10).text(`Fecha: ${this.formatDate(data.date)}`, 50);
      if (data.dueDate) {
        doc.text(`Vencimiento: ${this.formatDate(data.dueDate)}`);
      }
      doc.moveDown(1);

      // Job/Contract info
      if (data.jobTitle) {
        doc.font('Helvetica-Bold').text('Servicio:', { continued: true });
        doc.font('Helvetica').text(` ${data.jobTitle}`);
      }
      if (data.contractId) {
        doc.font('Helvetica-Bold').text('Contrato Nº:', { continued: true });
        doc.font('Helvetica').text(` ${data.contractId}`);
      }
      doc.moveDown(1);

      // Items table header
      const tableTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Descripción', 50, tableTop);
      doc.text('Cant.', 300, tableTop);
      doc.text('Precio Unit.', 350, tableTop);
      doc.text('Total', 450, tableTop);

      // Line under header
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      // Items
      let y = tableTop + 25;
      doc.font('Helvetica').fontSize(10);
      for (const item of data.items) {
        doc.text(item.description.slice(0, 40), 50, y);
        doc.text(item.quantity.toString(), 300, y);
        doc.text(this.formatCurrency(item.unitPrice, data.currency), 350, y);
        doc.text(this.formatCurrency(item.total, data.currency), 450, y);
        y += 20;
      }

      // Line before totals
      doc.moveTo(350, y).lineTo(550, y).stroke();
      y += 10;

      // Totals
      doc.font('Helvetica').fontSize(10);
      doc.text('Subtotal:', 350, y);
      doc.text(this.formatCurrency(data.subtotal, data.currency), 450, y);
      y += 15;

      if (data.commission !== undefined) {
        doc.text(`Comisión DOAPP (${data.commissionRate || 0}%):`, 350, y);
        doc.text(`-${this.formatCurrency(data.commission, data.currency)}`, 450, y);
        y += 15;
      }

      if (data.tax !== undefined) {
        doc.text(`IVA (${data.taxRate || 21}%):`, 350, y);
        doc.text(this.formatCurrency(data.tax, data.currency), 450, y);
        y += 15;
      }

      // Total
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('TOTAL:', 350, y);
      doc.text(this.formatCurrency(data.total, data.currency), 450, y);
      y += 25;

      // Payment info
      if (data.paymentMethod || data.transactionId) {
        doc.font('Helvetica').fontSize(10);
        doc.text('Información de Pago:', 50, y);
        y += 15;
        if (data.paymentMethod) doc.text(`Método: ${data.paymentMethod}`, 50, y);
        y += 12;
        if (data.transactionId) doc.text(`ID Transacción: ${data.transactionId}`, 50, y);
        y += 20;
      }

      // Notes
      if (data.notes) {
        doc.fontSize(9).text(`Notas: ${data.notes}`, 50, y);
      }

      // Footer
      doc.fontSize(8).text(
        'Este documento fue generado automáticamente por DOAPP. Para consultas: soporte@doapp.com',
        50,
        doc.page.height - 50,
        { align: 'center', width: 500 }
      );

      doc.end();

      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  /**
   * Generate receipt PDF
   */
  async generateReceipt(data: ReceiptData): Promise<string> {
    return new Promise((resolve, reject) => {
      const filename = `receipt_${data.receiptNumber}_${Date.now()}.pdf`;
      const filepath = path.join(this.receiptsDir, filename);

      const doc = new PDFDocument({ margin: 50, size: 'A5' });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('RECIBO', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(`Nº ${data.receiptNumber}`, { align: 'center' });
      doc.moveDown(1);

      // Company info
      doc.fontSize(12).font('Helvetica-Bold').text('DOAPP');
      doc.fontSize(9).font('Helvetica').text('Plataforma de Servicios Freelance');
      doc.moveDown(1);

      // Date
      doc.fontSize(10).text(`Fecha: ${this.formatDate(data.date)}`);
      doc.moveDown(0.5);

      // User info
      doc.text(`Usuario: ${data.userName}`);
      doc.text(`Email: ${data.userEmail}`);
      doc.moveDown(1);

      // Content
      doc.font('Helvetica-Bold').text('Descripción:');
      doc.font('Helvetica').text(data.description);
      doc.moveDown(1);

      // Amount
      doc.font('Helvetica-Bold').fontSize(14);
      doc.text(`Monto: ${this.formatCurrency(data.amount, data.currency)}`);
      doc.moveDown(0.5);

      // Status
      const statusColors: Record<string, string> = {
        completed: '#22c55e',
        pending: '#f59e0b',
        failed: '#ef4444',
      };
      doc.fontSize(10).text(`Estado: ${data.status.toUpperCase()}`);
      doc.moveDown(1);

      // Payment details
      doc.fontSize(9);
      doc.text(`Método de pago: ${data.paymentMethod}`);
      if (data.transactionId) {
        doc.text(`ID Transacción: ${data.transactionId}`);
      }
      doc.moveDown(1);

      // Notes
      if (data.notes) {
        doc.text(`Notas: ${data.notes}`);
      }

      // Footer
      doc.fontSize(7).text(
        'Documento generado por DOAPP',
        50,
        doc.page.height - 40,
        { align: 'center' }
      );

      doc.end();

      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  /**
   * Generate withdrawal receipt
   */
  async generateWithdrawalReceipt(data: {
    withdrawalId: string;
    date: Date;
    userName: string;
    userEmail: string;
    amount: number;
    currency: string;
    cbuMasked: string;
    bankAlias?: string;
    status: string;
    processedAt?: Date;
    transactionReference?: string;
  }): Promise<string> {
    return this.generateReceipt({
      receiptNumber: `WD-${data.withdrawalId}`,
      date: data.date,
      userName: data.userName,
      userEmail: data.userEmail,
      description: `Retiro de fondos a CBU ${data.cbuMasked}${data.bankAlias ? ` (${data.bankAlias})` : ''}`,
      amount: data.amount,
      currency: data.currency,
      paymentMethod: 'Transferencia Bancaria',
      transactionId: data.transactionReference,
      status: data.status,
      notes: data.processedAt ? `Procesado el ${this.formatDate(data.processedAt)}` : undefined,
    });
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency === 'ARS' ? 'ARS' : 'USD',
    }).format(amount);
  }

  /**
   * Generate quote/cotización PDF matching the invoice template style
   */
  async generateQuote(quote: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const quotesDir = path.join(this.uploadsDir, 'quotes');
      if (!fs.existsSync(quotesDir)) fs.mkdirSync(quotesDir, { recursive: true });

      const filename = `${quote.quoteNumber}_${Date.now()}.pdf`;
      const filepath = path.join(quotesDir, filename);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const pageWidth = doc.page.width - 100; // account for margins
      const col2Start = 350;

      // ── Header ──────────────────────────────────────────────────────────
      const senderName = quote.senderInfo?.name || quote.sender?.name || 'Remitente';
      const senderAddress = quote.senderInfo?.address || '';
      const senderCity = quote.senderInfo?.city || '';

      doc.fontSize(18).font('Helvetica-Bold').text(senderName, 50, 50);
      doc.fontSize(9).font('Helvetica');
      if (senderAddress) doc.text(senderAddress, 50, doc.y);
      if (senderCity) doc.text(senderCity, 50, doc.y);

      doc.fontSize(28).font('Helvetica-Bold').text('COTIZACIÓN', col2Start, 50, { width: pageWidth - col2Start + 50, align: 'right' });

      doc.moveTo(50, 120).lineTo(doc.page.width - 50, 120).strokeColor('#cccccc').stroke();
      doc.moveDown(0.5);

      // ── Billing / Recipient / Quote info ─────────────────────────────────
      const infoY = 135;
      const col3Start = col2Start - 100;

      // "A:" column
      doc.fontSize(9).font('Helvetica-Bold').text('A:', 50, infoY);
      doc.font('Helvetica').fontSize(9);
      const recipientName = quote.recipientInfo?.name || quote.recipient?.name || '';
      const recipientAddress = quote.recipientInfo?.address || '';
      const recipientCity = quote.recipientInfo?.city || '';
      doc.text(recipientName, 50, infoY + 14);
      if (recipientAddress) doc.text(recipientAddress, 50, doc.y);
      if (recipientCity) doc.text(recipientCity, 50, doc.y);

      // Quote metadata column (right)
      const metaItems: [string, string][] = [
        ['Nº de cotización', quote.quoteNumber],
        ['Fecha', new Date(quote.createdAt || Date.now()).toLocaleDateString('es-AR')],
      ];
      if (quote.job?.title) metaItems.push(['Trabajo', quote.job.title]);
      if (quote.validUntil) {
        metaItems.push(['Fecha vencimiento', new Date(quote.validUntil).toLocaleDateString('es-AR')]);
      }

      let metaY = infoY;
      for (const [label, value] of metaItems) {
        doc.font('Helvetica-Bold').fontSize(8).text(label, col3Start, metaY, { width: 100 });
        doc.font('Helvetica').fontSize(8).text(value, col3Start + 100, metaY, { width: 100 });
        metaY += 15;
      }

      // ── Items table ──────────────────────────────────────────────────────
      const tableTop = Math.max(doc.y + 20, 235);
      const colWidths = { cant: 50, desc: pageWidth - 230, unit: 100, amount: 80 };
      const colX = {
        cant: 50,
        desc: 100,
        unit: 100 + colWidths.desc,
        amount: 100 + colWidths.desc + colWidths.unit,
      };

      // Table header
      doc.rect(50, tableTop, pageWidth, 20).fillAndStroke('#f0f0f0', '#cccccc');
      doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold');
      doc.text('CANT.', colX.cant, tableTop + 5, { width: colWidths.cant, align: 'center' });
      doc.text('DESCRIPCIÓN', colX.desc, tableTop + 5, { width: colWidths.desc });
      doc.text('PRECIO UNITARIO', colX.unit, tableTop + 5, { width: colWidths.unit, align: 'right' });
      doc.text('IMPORTE', colX.amount, tableTop + 5, { width: colWidths.amount, align: 'right' });

      // Rows
      let rowY = tableTop + 20;
      doc.font('Helvetica').fontSize(9);
      const items: any[] = quote.items || [];

      for (const item of items) {
        const rowHeight = 22;
        doc.rect(50, rowY, pageWidth, rowHeight).strokeColor('#eeeeee').stroke();
        doc.fillColor('#000000');
        doc.text(String(item.qty), colX.cant, rowY + 6, { width: colWidths.cant, align: 'center' });
        doc.text(String(item.description), colX.desc, rowY + 6, { width: colWidths.desc });
        doc.text(`$${Number(item.unitPrice).toLocaleString('es-AR')}`, colX.unit, rowY + 6, { width: colWidths.unit, align: 'right' });
        doc.text(`$${Number(item.amount).toLocaleString('es-AR')}`, colX.amount, rowY + 6, { width: colWidths.amount, align: 'right' });
        rowY += rowHeight;
      }

      // ── Totals ────────────────────────────────────────────────────────────
      const totalsX = colX.unit;
      const totalsWidth = colWidths.unit + colWidths.amount;
      rowY += 8;

      const addTotal = (label: string, value: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9);
        doc.text(label, totalsX, rowY, { width: colWidths.unit, align: 'left' });
        doc.text(value, colX.amount, rowY, { width: colWidths.amount, align: 'right' });
        rowY += bold ? 18 : 15;
      };

      addTotal('Subtotal', `$${Number(quote.subtotal).toLocaleString('es-AR')}`);
      addTotal(`IVA ${Number(quote.taxRate).toFixed(1)}%`, `$${Number(quote.taxAmount).toLocaleString('es-AR')}`);

      for (const other of (quote.otherTaxes || []) as any[]) {
        addTotal(`${other.name} ${other.rate}%`, `$${Number(other.amount).toLocaleString('es-AR')}`);
      }

      doc.moveTo(totalsX, rowY).lineTo(50 + pageWidth, rowY).strokeColor('#333333').lineWidth(1).stroke();
      rowY += 6;
      addTotal('TOTAL', `$${Number(quote.total).toLocaleString('es-AR')} ARS`, true);

      // ── Signature area ────────────────────────────────────────────────────
      rowY += 30;
      doc.moveTo(col2Start, rowY + 40).lineTo(50 + pageWidth, rowY + 40).strokeColor('#333333').lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8).text('Firma', col2Start, rowY + 45, { width: pageWidth - col2Start + 50, align: 'center' });

      // ── Footer ────────────────────────────────────────────────────────────
      const footerY = doc.page.height - 100;
      doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).strokeColor('#cccccc').stroke();

      doc.fontSize(8).font('Helvetica-Bold').text('Condiciones y forma de pago', 50, footerY + 8);
      if (quote.paymentTerms) {
        doc.font('Helvetica').text(quote.paymentTerms, 50, doc.y + 2);
      }
      if (quote.notes) {
        doc.font('Helvetica-Bold').text('Observaciones', 50, doc.y + 6);
        doc.font('Helvetica').text(quote.notes, 50, doc.y + 2);
      }

      doc.end();

      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  /**
   * Get file URL for download
   */
  getFileUrl(filepath: string, req: any): string {
    const filename = path.basename(filepath);
    const directory = path.basename(path.dirname(filepath));
    const protocol = req?.protocol || 'https';
    const host = req?.get?.('host') || 'localhost:3001';
    return `${protocol}://${host}/uploads/${directory}/${filename}`;
  }
}

const pdfGenerator = new PDFGenerator();
export const generateQuotePDF = (quote: any) => pdfGenerator.generateQuote(quote);
export default pdfGenerator;
