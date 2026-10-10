import { supabase } from "./supabase";
import {
  getPendingOrders,
  getPendingReturns,
  getPendingCustomers,
  getPendingCustomerPayments,
  updatePendingOrder,
  updatePendingReturn,
  updatePendingCustomer,
  updatePendingCustomerPayment,
  removePendingOrder,
  removePendingReturn,
  removePendingCustomer,
  removePendingCustomerPayment,
} from "./offlineQueue";

export type SyncResult = { synced: number; failed: number; failedLabels: string[] };

// Syncs the offline queue one entry at a time, oldest first, so orders get
// their real server-assigned numbers in the order they actually happened.
// A failure on one entry (e.g. a stock conflict with something another
// device already sold while this one was queued) never blocks the rest —
// it's marked "failed" with the reason and left in the queue for the
// cashier/owner to review from the Pending Sync screen, while every other
// queued sale keeps syncing normally.
export async function syncPendingOrders(
  businessId: string,
  userId: string,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const items = (await getPendingOrders(businessId, userId))
    .filter((i) => i.status === "pending" || i.status === "failed")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let synced = 0;
  let failed = 0;
  const failedLabels: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);
    await updatePendingOrder(businessId, userId, item.local_id, { status: "syncing", error: undefined });

    try {
      let finalCustomerId = item.payload.customerId;
      if (item.payload.customerId === "__new__" && item.payload.newCustomerName.trim()) {
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            business_id: businessId,
            name: item.payload.newCustomerName.trim(),
            phone: item.payload.newCustomerPhone.trim() || null,
          })
          .select("id")
          .single();
        if (customerError) throw customerError;
        finalCustomerId = newCustomer.id;
      } else if (item.payload.customerId === "__new__") {
        finalCustomerId = null;
      }

      const { data: orderId, error } = await supabase.rpc("create_order", {
        p_business_id: businessId,
        p_customer_id: finalCustomerId,
        p_discount_type: item.payload.discountType,
        p_discount_value: item.payload.discountValue,
        p_notes: item.payload.notes || null,
        p_items: item.payload.items.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
          unit_price_override: line.unit_price_override,
        })),
        p_payment_method: item.payload.paymentMethod,
        p_amount_paid: item.payload.amountPaid,
      });
      if (error) throw error;

      const { data: orderRow } = await supabase.from("orders").select("order_number").eq("id", orderId).maybeSingle();
      await removePendingOrder(businessId, userId, item.local_id);
      synced++;
      void orderRow;
    } catch (e: any) {
      failed++;
      failedLabels.push(item.local_label);
      await updatePendingOrder(businessId, userId, item.local_id, {
        status: "failed",
        error: e?.message ?? "Could not sync this sale.",
      });
    }
  }

  return { synced, failed, failedLabels };
}

export async function syncPendingReturns(
  businessId: string,
  userId: string,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const items = (await getPendingReturns(businessId, userId))
    .filter((i) => i.status === "pending" || i.status === "failed")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let synced = 0;
  let failed = 0;
  const failedLabels: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);
    await updatePendingReturn(businessId, userId, item.local_id, { status: "syncing", error: undefined });

    try {
      const { error } = await supabase.rpc("create_return", {
        p_business_id: businessId,
        p_customer_id: item.payload.customerId || null,
        p_items: item.payload.items.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
        p_deduction_type: item.payload.deductionType,
        p_deduction_value: item.payload.deductionValue,
        p_notes: item.payload.notes || null,
        p_dry_run: false,
      });
      if (error) throw error;

      await removePendingReturn(businessId, userId, item.local_id);
      synced++;
    } catch (e: any) {
      failed++;
      failedLabels.push(item.local_label);
      await updatePendingReturn(businessId, userId, item.local_id, {
        status: "failed",
        error: e?.message ?? "Could not sync this return.",
      });
    }
  }

  return { synced, failed, failedLabels };
}

export async function syncPendingCustomers(
  businessId: string,
  userId: string,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const items = (await getPendingCustomers(businessId, userId))
    .filter((i) => i.status === "pending" || i.status === "failed")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let synced = 0;
  let failed = 0;
  const failedLabels: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);
    await updatePendingCustomer(businessId, userId, item.local_id, { status: "syncing", error: undefined });

    try {
      const { error } = await supabase.from("customers").insert({
        business_id: businessId,
        name: item.payload.name,
        phone: item.payload.phone || null,
        email: item.payload.email || null,
        address: item.payload.address || null,
        notes: item.payload.notes || null,
      });
      if (error) throw error;

      await removePendingCustomer(businessId, userId, item.local_id);
      synced++;
    } catch (e: any) {
      failed++;
      failedLabels.push(item.local_label);
      await updatePendingCustomer(businessId, userId, item.local_id, {
        status: "failed",
        error: e?.message ?? "Could not sync this customer.",
      });
    }
  }

  return { synced, failed, failedLabels };
}

export async function syncPendingCustomerPayments(
  businessId: string,
  userId: string,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const items = (await getPendingCustomerPayments(businessId, userId))
    .filter((i) => i.status === "pending" || i.status === "failed")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let synced = 0;
  let failed = 0;
  const failedLabels: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);
    await updatePendingCustomerPayment(businessId, userId, item.local_id, { status: "syncing", error: undefined });

    try {
      const { error } = await supabase.rpc("record_customer_payment", {
        p_customer_id: item.payload.customerId,
        p_amount: item.payload.amount,
      });
      if (error) throw error;

      await removePendingCustomerPayment(businessId, userId, item.local_id);
      synced++;
    } catch (e: any) {
      failed++;
      failedLabels.push(item.local_label);
      await updatePendingCustomerPayment(businessId, userId, item.local_id, {
        status: "failed",
        error: e?.message ?? "Could not sync this payment.",
      });
    }
  }

  return { synced, failed, failedLabels };
}

export async function syncAllPending(businessId: string, userId: string) {
  const customerResult = await syncPendingCustomers(businessId, userId);
  const orderResult = await syncPendingOrders(businessId, userId);
  const returnResult = await syncPendingReturns(businessId, userId);
  const paymentResult = await syncPendingCustomerPayments(businessId, userId);
  return { customerResult, orderResult, returnResult, paymentResult };
}
