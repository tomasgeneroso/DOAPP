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

export default new PDFGenerator();
