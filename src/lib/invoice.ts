import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { formatQuantity, UnitType } from "./units";

// A4 at 72 DPI (PDF points). Thermal receipts are 80mm wide; height is generous
// since these are continuous-feed receipts, not fixed-size pages.
const A4_SIZE = { width: 595, height: 842 };
const THERMAL_SIZE = { width: 226, height: 1600 };

async function printOrShare(html: string, size: { width: number; height: number }) {
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  try {
    const { uri } = await Print.printToFileAsync({ html, ...size });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Share via WhatsApp or other apps",
      });
      return;
    }
  } catch {
    // The generated file isn't shareable on this device/environment (e.g. Expo
    // Go's sandboxed file access) — fall back to the OS print/share sheet
    // directly from the HTML instead of a cached file.
  }
  await Print.printAsync({ html });
}

type InvoiceBusiness = {
  name: string;
  phone: string | null;
  address: string | null;
  logo_url?: string | null;
};
type InvoiceCustomer = { name: string; phone: string | null } | null;
type InvoiceItem = {
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  unit_type?: UnitType;
  unit?: string | null;
  pack_size?: number | null;
};

function displayQuantity(item: InvoiceItem): string {
  if (item.unit_type && item.unit_type !== "each") {
    return formatQuantity(item.quantity, {
      unit_type: item.unit_type,
      unit: item.unit ?? null,
      pack_size: item.pack_size ?? null,
      pack_price: null,
    });
  }
  return String(item.quantity);
}
type InvoiceOrder = {
  order_number: string;
  created_at: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  cashier_name?: string | null;
};
export type InvoiceFormat = "a4" | "thermal";

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Comma thousand-separators on printed invoices/receipts, so a customer
// reading "Rs. 12,500.00" doesn't have to count zeros.
function money(n: number): string {
  return `Rs. ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildA4InvoiceHTML(
  business: InvoiceBusiness,
  customer: InvoiceCustomer,
  order: InvoiceOrder,
  items: InvoiceItem[],
) {
  const due = order.total - order.amount_paid;
  const rows = items
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.name)}</td>
      <td style="text-align:center">${escapeHtml(displayQuantity(item))}</td>
      <td style="text-align:right">${money(item.unit_price)}</td>
      <td style="text-align:right">${money(item.subtotal)}</td>
    </tr>`,
    )
    .join("");

  return `
  <html><head><meta charset="utf-8" /><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 32px; color: #0F172A; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .muted { color: #64748B; font-size: 13px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 48px; height: 48px; object-fit: contain; border-radius: 6px; }
    .section { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { text-align: left; border-bottom: 2px solid #0F172A; padding: 8px 4px; font-size: 13px; }
    td { border-bottom: 1px solid #E2E8F0; padding: 8px 4px; font-size: 13px; }
    .totals { margin-top: 16px; width: 260px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .totals-row.grand { font-size: 16px; font-weight: 700; border-top: 2px solid #0F172A; padding-top: 8px; margin-top: 4px; }
    .footer { margin-top: 40px; text-align: center; color: #94A3B8; font-size: 11px; }
  </style></head><body>
    <div class="header">
      <div class="brand">
        ${business.logo_url ? `<img class="logo" src="${business.logo_url}" />` : ""}
        <div><h1>${escapeHtml(business.name)}</h1>
        ${business.phone ? `<div class="muted">${escapeHtml(business.phone)}</div>` : ""}
        ${business.address ? `<div class="muted">${escapeHtml(business.address)}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right">
        <div class="muted">Invoice</div>
        <div style="font-weight:700; font-size:16px">${escapeHtml(order.order_number)}</div>
        <div class="muted">${new Date(order.created_at).toLocaleDateString()}</div>
        ${order.cashier_name ? `<div class="muted">Served by ${escapeHtml(order.cashier_name)}</div>` : ""}
      </div>
    </div>
    <div class="section">
      <div class="muted">Bill To</div>
      <div style="font-weight:600">${customer ? escapeHtml(customer.name) : "Walk-in Customer"}</div>
      ${customer?.phone ? `<div class="muted">${escapeHtml(customer.phone)}</div>` : ""}
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
      <div class="totals-row"><span>Discount</span><span>${money(order.discount)}</span></div>
      <div class="totals-row grand"><span>Total</span><span>${money(order.total)}</span></div>
      <div class="totals-row"><span>Paid</span><span>${money(order.amount_paid)}</span></div>
      ${due > 0 ? `<div class="totals-row" style="color:#D97706;font-weight:600"><span>Due</span><span>${money(due)}</span></div>` : ""}
    </div>
    <div class="footer">Thank you for your business</div>
  </body></html>`;
}

function buildThermalInvoiceHTML(
  business: InvoiceBusiness,
  customer: InvoiceCustomer,
  order: InvoiceOrder,
  items: InvoiceItem[],
) {
  const due = order.total - order.amount_paid;
  const itemsHtml = items
    .map(
      (item) => `
    <div>${escapeHtml(item.name)}</div>
    <div class="row"><span>${escapeHtml(displayQuantity(item))} x ${item.unit_price.toFixed(2)}</span><span>${item.subtotal.toFixed(2)}</span></div>
  `,
    )
    .join("");

  return `
  <html><head><meta charset="utf-8" /><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 80mm; }
    body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 3mm; font-size: 12px; color: #000; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 2mm 0; }
    .row { display: flex; justify-content: space-between; }
    .bold { font-weight: bold; }
    .big { font-size: 14px; }
  </style></head><body>
    <div class="center bold big">${escapeHtml(business.name)}</div>
    ${business.phone ? `<div class="center">${escapeHtml(business.phone)}</div>` : ""}
    ${business.address ? `<div class="center">${escapeHtml(business.address)}</div>` : ""}
    <div class="line"></div>
    <div>Invoice: ${escapeHtml(order.order_number)}</div>
    <div>Date: ${new Date(order.created_at).toLocaleString()}</div>
    ${order.cashier_name ? `<div>Served by: ${escapeHtml(order.cashier_name)}</div>` : ""}
    <div>Customer: ${customer ? escapeHtml(customer.name) : "Walk-in"}</div>
    <div class="line"></div>
    ${itemsHtml}
    <div class="line"></div>
    <div class="row"><span>Subtotal</span><span>${order.subtotal.toFixed(2)}</span></div>
    <div class="row"><span>Discount</span><span>${order.discount.toFixed(2)}</span></div>
    <div class="row bold"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
    <div class="row"><span>Paid</span><span>${order.amount_paid.toFixed(2)}</span></div>
    ${due > 0 ? `<div class="row bold"><span>Due</span><span>${due.toFixed(2)}</span></div>` : ""}
    <div class="line"></div>
    <div class="center">Thank you!</div>
  </body></html>`;
}

export async function generateAndShareInvoice(
  business: InvoiceBusiness,
  customer: InvoiceCustomer,
  order: InvoiceOrder,
  items: InvoiceItem[],
  format: InvoiceFormat = "a4",
) {
  if (format === "thermal") {
    await printOrShare(buildThermalInvoiceHTML(business, customer, order, items), THERMAL_SIZE);
  } else {
    await printOrShare(buildA4InvoiceHTML(business, customer, order, items), A4_SIZE);
  }
}

type PaymentReceiptData = {
  customerName: string;
  amount: number;
  date: string;
  totalPurchases: number;
  totalPaid: number;
  totalDue: number;
};

function buildPaymentReceiptHTML(
  business: InvoiceBusiness,
  data: PaymentReceiptData,
) {
  return `
  <html><head><meta charset="utf-8" /><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 80mm; }
    body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 3mm; font-size: 12px; color: #000; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 2mm 0; }
    .row { display: flex; justify-content: space-between; }
    .bold { font-weight: bold; }
    .big { font-size: 14px; }
  </style></head><body>
    <div class="center bold big">${escapeHtml(business.name)}</div>
    ${business.phone ? `<div class="center">${escapeHtml(business.phone)}</div>` : ""}
    <div class="line"></div>
    <div class="center bold">PAYMENT RECEIPT</div>
    <div>Date: ${new Date(data.date).toLocaleString()}</div>
    <div>Customer: ${escapeHtml(data.customerName)}</div>
    <div class="line"></div>
    <div class="row bold"><span>Amount Received</span><span>${money(data.amount)}</span></div>
    <div class="line"></div>
    <div class="row"><span>Total Purchases</span><span>${money(data.totalPurchases)}</span></div>
    <div class="row"><span>Total Paid</span><span>${money(data.totalPaid)}</span></div>
    <div class="row bold"><span>Balance Due</span><span>${money(data.totalDue)}</span></div>
    <div class="line"></div>
    <div class="center">Thank you!</div>
  </body></html>`;
}

export async function generatePaymentReceipt(
  business: InvoiceBusiness,
  data: PaymentReceiptData,
) {
  await printOrShare(buildPaymentReceiptHTML(business, data), THERMAL_SIZE);
}

type StatementOrder = {
  order_number: string;
  created_at: string;
  total: number;
  amount_paid: number;
  status: string;
};

function buildCustomerStatementHTML(
  business: InvoiceBusiness,
  customerName: string,
  customerPhone: string | null,
  orders: StatementOrder[],
) {
  const active = orders.filter((o) => o.status !== "cancelled");
  const rows = active
    .slice()
    .reverse()
    .map((o) => {
      const due = Math.max(0, Number(o.total) - Number(o.amount_paid));
      return `
    <tr>
      <td>${new Date(o.created_at).toLocaleDateString()}</td>
      <td>${escapeHtml(o.order_number)}</td>
      <td style="text-align:right">${money(Number(o.total))}</td>
      <td style="text-align:right">${money(Number(o.amount_paid))}</td>
      <td style="text-align:right; ${due > 0 ? "color:#D97706;font-weight:600" : ""}">${money(due)}</td>
    </tr>`;
    })
    .join("");

  const totalPurchases = active.reduce((s, o) => s + Number(o.total), 0);
  const totalPaid = active.reduce((s, o) => s + Number(o.amount_paid), 0);
  const totalDue = Math.max(0, totalPurchases - totalPaid);

  return `
  <html><head><meta charset="utf-8" /><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 32px; color: #0F172A; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .muted { color: #64748B; font-size: 13px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 44px; height: 44px; object-fit: contain; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { text-align: left; border-bottom: 2px solid #0F172A; padding: 8px 4px; font-size: 12px; }
    td { border-bottom: 1px solid #E2E8F0; padding: 8px 4px; font-size: 12px; }
    .totals { margin-top: 16px; width: 280px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .totals-row.grand { font-size: 16px; font-weight: 700; border-top: 2px solid #0F172A; padding-top: 8px; margin-top: 4px; color: #D97706; }
    .footer { margin-top: 40px; text-align: center; color: #94A3B8; font-size: 11px; }
  </style></head><body>
    <div class="header">
      <div class="brand">
        ${business.logo_url ? `<img class="logo" src="${business.logo_url}" />` : ""}
        <div><h1>${escapeHtml(business.name)}</h1>
        ${business.phone ? `<div class="muted">${escapeHtml(business.phone)}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right">
        <div class="muted">Customer Statement</div>
        <div style="font-weight:700; font-size:16px">${escapeHtml(customerName)}</div>
        ${customerPhone ? `<div class="muted">${escapeHtml(customerPhone)}</div>` : ""}
        <div class="muted">${new Date().toLocaleDateString()}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Order</th><th style="text-align:right">Total</th><th style="text-align:right">Paid</th><th style="text-align:right">Due</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center; color:#94A3B8">No orders yet</td></tr>`}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Total Purchases</span><span>${money(totalPurchases)}</span></div>
      <div class="totals-row"><span>Total Paid</span><span>${money(totalPaid)}</span></div>
      <div class="totals-row grand"><span>Balance Due</span><span>${money(totalDue)}</span></div>
    </div>
    <div class="footer">Thank you for your business</div>
  </body></html>`;
}

function buildThermalCustomerStatementHTML(
  business: InvoiceBusiness,
  customerName: string,
  customerPhone: string | null,
  orders: StatementOrder[],
) {
  const active = orders.filter((o) => o.status !== "cancelled");
  const rows = active
    .slice()
    .reverse()
    .map((o) => {
      const due = Math.max(0, Number(o.total) - Number(o.amount_paid));
      return `
    <div>${escapeHtml(o.order_number)} - ${new Date(o.created_at).toLocaleDateString()}</div>
    <div class="row"><span>Total ${money(Number(o.total))}</span><span>Paid ${money(Number(o.amount_paid))}</span></div>
    ${due > 0 ? `<div class="row bold"><span></span><span>Due ${money(due)}</span></div>` : ""}
  `;
    })
    .join("<div class=\"line\"></div>");

  const totalPurchases = active.reduce((s, o) => s + Number(o.total), 0);
  const totalPaid = active.reduce((s, o) => s + Number(o.amount_paid), 0);
  const totalDue = Math.max(0, totalPurchases - totalPaid);

  return `
  <html><head><meta charset="utf-8" /><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 80mm; }
    body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 3mm; font-size: 12px; color: #000; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 2mm 0; }
    .row { display: flex; justify-content: space-between; }
    .bold { font-weight: bold; }
    .big { font-size: 14px; }
  </style></head><body>
    <div class="center bold big">${escapeHtml(business.name)}</div>
    ${business.phone ? `<div class="center">${escapeHtml(business.phone)}</div>` : ""}
    <div class="line"></div>
    <div class="center bold">Customer Statement</div>
    <div>${escapeHtml(customerName)}</div>
    ${customerPhone ? `<div>${escapeHtml(customerPhone)}</div>` : ""}
    <div>${new Date().toLocaleDateString()}</div>
    <div class="line"></div>
    ${rows || `<div class="center">No orders yet</div>`}
    <div class="line"></div>
    <div class="row"><span>Total Purchases</span><span>${money(totalPurchases)}</span></div>
    <div class="row"><span>Total Paid</span><span>${money(totalPaid)}</span></div>
    <div class="row bold"><span>Balance Due</span><span>${money(totalDue)}</span></div>
    <div class="line"></div>
    <div class="center">Thank you!</div>
  </body></html>`;
}

export async function generateCustomerStatement(
  business: InvoiceBusiness,
  customerName: string,
  customerPhone: string | null,
  orders: StatementOrder[],
  format: InvoiceFormat = "a4",
) {
  if (format === "thermal") {
    await printOrShare(buildThermalCustomerStatementHTML(business, customerName, customerPhone, orders), THERMAL_SIZE);
  } else {
    await printOrShare(buildCustomerStatementHTML(business, customerName, customerPhone, orders), A4_SIZE);
  }
}

type InvoiceReturn = {
  return_number: string;
  created_at: string;
  gross_amount: number;
  deduction_type: string;
  deduction_value: number;
  deduction_amount: number;
  net_amount: number;
  cashier_name?: string | null;
};

function buildA4ReturnReceiptHTML(
  business: InvoiceBusiness,
  customer: InvoiceCustomer,
  ret: InvoiceReturn,
  items: InvoiceItem[],
) {
  const rows = items
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.name)}</td>
      <td style="text-align:center">${escapeHtml(displayQuantity(item))}</td>
      <td style="text-align:right">${money(item.unit_price)}</td>
      <td style="text-align:right">${money(item.subtotal)}</td>
    </tr>`,
    )
    .join("");
  const deductionLabel = ret.deduction_type === "percentage" ? `${ret.deduction_value}%` : "Flat";

  return `
  <html><head><meta charset="utf-8" /><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 32px; color: #0F172A; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .muted { color: #64748B; font-size: 13px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 48px; height: 48px; object-fit: contain; border-radius: 6px; }
    .section { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { text-align: left; border-bottom: 2px solid #0F172A; padding: 8px 4px; font-size: 13px; }
    td { border-bottom: 1px solid #E2E8F0; padding: 8px 4px; font-size: 13px; }
    .totals { margin-top: 16px; width: 260px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .totals-row.grand { font-size: 16px; font-weight: 700; border-top: 2px solid #0F172A; padding-top: 8px; margin-top: 4px; color: #D97706; }
    .footer { margin-top: 40px; text-align: center; color: #94A3B8; font-size: 11px; }
  </style></head><body>
    <div class="header">
      <div class="brand">
        ${business.logo_url ? `<img class="logo" src="${business.logo_url}" />` : ""}
        <div><h1>${escapeHtml(business.name)}</h1>
        ${business.phone ? `<div class="muted">${escapeHtml(business.phone)}</div>` : ""}
        ${business.address ? `<div class="muted">${escapeHtml(business.address)}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right">
        <div class="muted">Return Receipt</div>
        <div style="font-weight:700; font-size:16px">${escapeHtml(ret.return_number)}</div>
        <div class="muted">${new Date(ret.created_at).toLocaleDateString()}</div>
        ${ret.cashier_name ? `<div class="muted">Processed by ${escapeHtml(ret.cashier_name)}</div>` : ""}
      </div>
    </div>
    <div class="section">
      <div class="muted">Customer</div>
      <div style="font-weight:600">${customer ? escapeHtml(customer.name) : "Walk-in Customer"}</div>
      ${customer?.phone ? `<div class="muted">${escapeHtml(customer.phone)}</div>` : ""}
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="totals">
      <div class="totals-row"><span>Gross Amount</span><span>${money(ret.gross_amount)}</span></div>
      ${ret.deduction_amount > 0 ? `<div class="totals-row"><span>Deduction (${deductionLabel})</span><span>− ${money(ret.deduction_amount)}</span></div>` : ""}
      <div class="totals-row grand"><span>Net Refund</span><span>${money(ret.net_amount)}</span></div>
    </div>
    <div class="footer">Thank you for your business</div>
  </body></html>`;
}

function buildThermalReturnReceiptHTML(
  business: InvoiceBusiness,
  customer: InvoiceCustomer,
  ret: InvoiceReturn,
  items: InvoiceItem[],
) {
  const itemsHtml = items
    .map(
      (item) => `
    <div>${escapeHtml(item.name)}</div>
    <div class="row"><span>${escapeHtml(displayQuantity(item))} x ${item.unit_price.toFixed(2)}</span><span>${item.subtotal.toFixed(2)}</span></div>
  `,
    )
    .join("");
  const deductionLabel = ret.deduction_type === "percentage" ? `${ret.deduction_value}%` : "Flat";

  return `
  <html><head><meta charset="utf-8" /><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 80mm; }
    body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 3mm; font-size: 12px; color: #000; }
    .center { text-align: center; }
    .line { border-top: 1px dashed #000; margin: 2mm 0; }
    .row { display: flex; justify-content: space-between; }
    .bold { font-weight: bold; }
    .big { font-size: 14px; }
  </style></head><body>
    <div class="center bold big">${escapeHtml(business.name)}</div>
    ${business.phone ? `<div class="center">${escapeHtml(business.phone)}</div>` : ""}
    ${business.address ? `<div class="center">${escapeHtml(business.address)}</div>` : ""}
    <div class="line"></div>
    <div class="center bold">RETURN RECEIPT</div>
    <div>Return: ${escapeHtml(ret.return_number)}</div>
    <div>Date: ${new Date(ret.created_at).toLocaleString()}</div>
    ${ret.cashier_name ? `<div>Processed by: ${escapeHtml(ret.cashier_name)}</div>` : ""}
    <div>Customer: ${customer ? escapeHtml(customer.name) : "Walk-in"}</div>
    <div class="line"></div>
    ${itemsHtml}
    <div class="line"></div>
    <div class="row"><span>Gross Amount</span><span>${ret.gross_amount.toFixed(2)}</span></div>
    ${ret.deduction_amount > 0 ? `<div class="row"><span>Deduction (${deductionLabel})</span><span>-${ret.deduction_amount.toFixed(2)}</span></div>` : ""}
    <div class="row bold"><span>Net Refund</span><span>${ret.net_amount.toFixed(2)}</span></div>
    <div class="line"></div>
    <div class="center">Thank you!</div>
  </body></html>`;
}

export async function generateReturnReceipt(
  business: InvoiceBusiness,
  customer: InvoiceCustomer,
  ret: InvoiceReturn,
  items: InvoiceItem[],
  format: InvoiceFormat = "a4",
) {
  if (format === "thermal") {
    await printOrShare(buildThermalReturnReceiptHTML(business, customer, ret, items), THERMAL_SIZE);
  } else {
    await printOrShare(buildA4ReturnReceiptHTML(business, customer, ret, items), A4_SIZE);
  }
}
