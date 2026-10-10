import AsyncStorage from "@react-native-async-storage/async-storage";

// Offline support for orders/returns: instead of one single draft that
// blocks the cashier from starting a new sale until they're back online
// (and can only hold ONE unsent sale at a time), each offline sale gets
// queued here with its own entry. Nothing in this queue has a real
// server-assigned order/return number yet — those only ever get assigned
// atomically on the server at sync time (see create_order/create_return),
// so two devices queuing offline sales all day never risk colliding on a
// number. Each entry gets a *local* label ("Offline Sale #3") purely so
// the cashier can tell their queued sales apart before they sync.

export type QueueItemStatus = "pending" | "syncing" | "synced" | "failed";

export type PendingOrderPayload = {
  customerId: string | null;
  newCustomerName: string;
  newCustomerPhone: string;
  discountType: "flat" | "percentage";
  discountValue: number;
  notes: string;
  items: { product_id: string; product_name: string; quantity: number; unit_price_override?: number }[];
  paymentMethod: string;
  amountPaid: number;
  totalEstimate: number;
};

export type PendingReturnPayload = {
  customerId: string | null;
  items: { product_id: string; product_name: string; quantity: number }[];
  deductionType: "flat" | "percentage";
  deductionValue: number;
  notes: string;
  netEstimate: number;
};

export type PendingCustomerPayload = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

export type PendingCustomerPaymentPayload = {
  customerId: string;
  customerName: string;
  amount: number;
};

export type PendingItem<T> = {
  local_id: string;
  local_label: string;
  status: QueueItemStatus;
  error?: string;
  created_at: string;
  synced_number?: string;
  payload: T;
};

function genLocalId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function ordersKey(businessId: string, userId: string) {
  return `ezbz_offline_orders_${businessId}_${userId}`;
}
function returnsKey(businessId: string, userId: string) {
  return `ezbz_offline_returns_${businessId}_${userId}`;
}
function customersKey(businessId: string, userId: string) {
  return `ezbz_offline_customers_${businessId}_${userId}`;
}
function customerPaymentsKey(businessId: string, userId: string) {
  return `ezbz_offline_customer_payments_${businessId}_${userId}`;
}

async function readQueue<T>(key: string): Promise<PendingItem<T>[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeQueue<T>(key: string, items: PendingItem<T>[]) {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

// --- Orders ---

export async function getPendingOrders(businessId: string, userId: string) {
  return readQueue<PendingOrderPayload>(ordersKey(businessId, userId));
}

export async function addPendingOrder(businessId: string, userId: string, payload: PendingOrderPayload) {
  const key = ordersKey(businessId, userId);
  const items = await readQueue<PendingOrderPayload>(key);
  const label = `Offline Sale #${items.length + 1}`;
  const item: PendingItem<PendingOrderPayload> = {
    local_id: genLocalId(),
    local_label: label,
    status: "pending",
    created_at: new Date().toISOString(),
    payload,
  };
  items.push(item);
  await writeQueue(key, items);
  return item;
}

export async function updatePendingOrder(
  businessId: string,
  userId: string,
  localId: string,
  patch: Partial<PendingItem<PendingOrderPayload>>,
) {
  const key = ordersKey(businessId, userId);
  const items = await readQueue<PendingOrderPayload>(key);
  const next = items.map((i) => (i.local_id === localId ? { ...i, ...patch } : i));
  await writeQueue(key, next);
}

export async function removePendingOrder(businessId: string, userId: string, localId: string) {
  const key = ordersKey(businessId, userId);
  const items = await readQueue<PendingOrderPayload>(key);
  await writeQueue(key, items.filter((i) => i.local_id !== localId));
}

// Quantity of a product already committed to the offline queue (pending or
// mid-sync), so a cashier adding to a new sale can be warned before they
// oversell against their own un-synced orders on this device.
export async function getQueuedQuantityForProduct(businessId: string, userId: string, productId: string) {
  const items = await getPendingOrders(businessId, userId);
  let total = 0;
  for (const item of items) {
    if (item.status === "synced") continue;
    for (const line of item.payload.items) {
      if (line.product_id === productId) total += line.quantity;
    }
  }
  return total;
}

// --- Returns ---

export async function getPendingReturns(businessId: string, userId: string) {
  return readQueue<PendingReturnPayload>(returnsKey(businessId, userId));
}

export async function addPendingReturn(businessId: string, userId: string, payload: PendingReturnPayload) {
  const key = returnsKey(businessId, userId);
  const items = await readQueue<PendingReturnPayload>(key);
  const label = `Offline Return #${items.length + 1}`;
  const item: PendingItem<PendingReturnPayload> = {
    local_id: genLocalId(),
    local_label: label,
    status: "pending",
    created_at: new Date().toISOString(),
    payload,
  };
  items.push(item);
  await writeQueue(key, items);
  return item;
}

export async function updatePendingReturn(
  businessId: string,
  userId: string,
  localId: string,
  patch: Partial<PendingItem<PendingReturnPayload>>,
) {
  const key = returnsKey(businessId, userId);
  const items = await readQueue<PendingReturnPayload>(key);
  const next = items.map((i) => (i.local_id === localId ? { ...i, ...patch } : i));
  await writeQueue(key, next);
}

export async function removePendingReturn(businessId: string, userId: string, localId: string) {
  const key = returnsKey(businessId, userId);
  const items = await readQueue<PendingReturnPayload>(key);
  await writeQueue(key, items.filter((i) => i.local_id !== localId));
}

// --- Customers ---

export async function getPendingCustomers(businessId: string, userId: string) {
  return readQueue<PendingCustomerPayload>(customersKey(businessId, userId));
}

export async function addPendingCustomer(businessId: string, userId: string, payload: PendingCustomerPayload) {
  const key = customersKey(businessId, userId);
  const items = await readQueue<PendingCustomerPayload>(key);
  const item: PendingItem<PendingCustomerPayload> = {
    local_id: genLocalId(),
    local_label: payload.name,
    status: "pending",
    created_at: new Date().toISOString(),
    payload,
  };
  items.push(item);
  await writeQueue(key, items);
  return item;
}

export async function updatePendingCustomer(
  businessId: string,
  userId: string,
  localId: string,
  patch: Partial<PendingItem<PendingCustomerPayload>>,
) {
  const key = customersKey(businessId, userId);
  const items = await readQueue<PendingCustomerPayload>(key);
  const next = items.map((i) => (i.local_id === localId ? { ...i, ...patch } : i));
  await writeQueue(key, next);
}

export async function removePendingCustomer(businessId: string, userId: string, localId: string) {
  const key = customersKey(businessId, userId);
  const items = await readQueue<PendingCustomerPayload>(key);
  await writeQueue(key, items.filter((i) => i.local_id !== localId));
}

// --- Customer payments (ledger entries) ---

export async function getPendingCustomerPayments(businessId: string, userId: string) {
  return readQueue<PendingCustomerPaymentPayload>(customerPaymentsKey(businessId, userId));
}

export async function addPendingCustomerPayment(
  businessId: string,
  userId: string,
  payload: PendingCustomerPaymentPayload,
) {
  const key = customerPaymentsKey(businessId, userId);
  const items = await readQueue<PendingCustomerPaymentPayload>(key);
  const item: PendingItem<PendingCustomerPaymentPayload> = {
    local_id: genLocalId(),
    local_label: `Payment — ${payload.customerName}`,
    status: "pending",
    created_at: new Date().toISOString(),
    payload,
  };
  items.push(item);
  await writeQueue(key, items);
  return item;
}

export async function updatePendingCustomerPayment(
  businessId: string,
  userId: string,
  localId: string,
  patch: Partial<PendingItem<PendingCustomerPaymentPayload>>,
) {
  const key = customerPaymentsKey(businessId, userId);
  const items = await readQueue<PendingCustomerPaymentPayload>(key);
  const next = items.map((i) => (i.local_id === localId ? { ...i, ...patch } : i));
  await writeQueue(key, next);
}

export async function removePendingCustomerPayment(businessId: string, userId: string, localId: string) {
  const key = customerPaymentsKey(businessId, userId);
  const items = await readQueue<PendingCustomerPaymentPayload>(key);
  await writeQueue(key, items.filter((i) => i.local_id !== localId));
}

// Total amount already queued as payments for a given customer (pending or
// mid-sync), so the "Record Payment" screen can warn before a cashier
// queues more than the customer's last-known outstanding balance covers.
export async function getQueuedPaymentTotalForCustomer(
  businessId: string,
  userId: string,
  customerId: string,
) {
  const items = await getPendingCustomerPayments(businessId, userId);
  let total = 0;
  for (const item of items) {
    if (item.status === "synced") continue;
    if (item.payload.customerId === customerId) total += item.payload.amount;
  }
  return total;
}
