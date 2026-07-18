export class InvoiceStatsDto {
  totalPaid: number;
  totalPending: number;
  totalQuotes: number;
  totalInvoices: number;
  clientCount?: number;
  averagePerClient?: number;
}
