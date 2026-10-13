import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { supabase } from "../../../src/lib/supabase";
import { useAuth } from "../../../src/hooks/useAuth";
import { useBusiness } from "../../../src/hooks/useBusiness";
import { useNetwork } from "../../../src/hooks/useNetwork";
import { useOfflineSync } from "../../../src/hooks/useOfflineSync";
import { addPendingOrder, getQueuedQuantityForProduct } from "../../../src/lib/offlineQueue";
import { generateAndShareInvoice } from "../../../src/lib/invoice";
import { showAlert } from "../../../src/lib/alert";
import { SegmentedControl } from "../../../src/components/segmented-control";
import { Button } from "../../../src/components/button";
import { can } from "../../../src/lib/permissions";
import { effectiveUnitPrice, formatQuantity, splitPacks, UnitType } from "../../../src/lib/units";
import { formatCurrency, isLessThanAmount } from "../../../src/lib/currency";
import { theme } from "../../../src/lib/theme";

const PAYMENT_METHODS = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank Transfer", value: "bank" },
  { label: "Other", value: "other" },
] as const;

const DISCOUNT_TYPES = [
  { label: "Flat (Rs.)", value: "flat" },
  { label: "Percentage (%)", value: "percentage" },
] as const;

type Product = {
  id: string;
  name: string;
  selling_price: number;
  stock_quantity: number;
  unit_type: UnitType;
  unit: string | null;
  pack_size: number | null;
  pack_price: number | null;
};
type Customer = { id: string; name: string };
type CartItem = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  unit_type: UnitType;
  unit: string | null;
  pack_size: number | null;
  pack_price: number | null;
};

function cartItemSubtotal(item: CartItem): number {
  if (item.unit_type === "pack" && item.pack_size) {
    const { packs, loose } = splitPacks(item.quantity, item.pack_size);
    return packs * (item.pack_price ?? 0) + loose * item.unit_price;
  }
  return item.quantity * item.unit_price;
}

function draftKeyFor(businessId: string, userId: string) {
  return `order_draft_${businessId}_${userId}`;
}

export default function NewOrder() {
  const { business, permissions } = useBusiness();
  const { session } = useAuth();
  const { isConnected } = useNetwork();
  const { refresh: refreshOfflineSync } = useOfflineSync();
  const router = useRouter();
  const canAddProduct = can(permissions, "products", "add");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductCost, setNewProductCost] = useState("");
  const [newProductQty, setNewProductQty] = useState("1");
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Raw text per cart row's quantity field, kept separate from the parsed
  // numeric `quantity` so intermediate states while typing (e.g. "0.", "2.")
  // aren't immediately clobbered by re-rendering with the parsed number —
  // that was silently making it impossible to type fractional kg/liter.
  const [qtyText, setQtyText] = useState<Record<string, string>>({});
  const [discountType, setDiscountType] = useState<"flat" | "percentage">("flat");
  const [discountValue, setDiscountValue] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("0");
  const [amountPaidTouched, setAmountPaidTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const draftRestored = useRef(false);

  useEffect(() => {
    if (!business || !session) return;
    AsyncStorage.getItem(draftKeyFor(business.id, session.user.id)).then((raw) => {
      draftRestored.current = true;
      if (!raw) return;
      try {
        const draft = JSON.parse(raw);
        if (draft.cart?.length) setCart(draft.cart);
        if (draft.customerId) setCustomerId(draft.customerId);
        if (draft.newCustomerName) setNewCustomerName(draft.newCustomerName);
        if (draft.newCustomerPhone) setNewCustomerPhone(draft.newCustomerPhone);
        if (draft.discountType) setDiscountType(draft.discountType);
        if (draft.discountValue) setDiscountValue(draft.discountValue);
        if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
        if (draft.amountPaid) setAmountPaid(draft.amountPaid);
        if (draft.amountPaidTouched) setAmountPaidTouched(draft.amountPaidTouched);
        if (draft.notes) setNotes(draft.notes);
        if (draft.cart?.length) showAlert("Draft Restored", "Your unsaved order from before was restored.");
      } catch {}
    });
  }, [business?.id, session?.user.id]);

  useEffect(() => {
    if (!business || !session || !draftRestored.current) return;
    const key = draftKeyFor(business.id, session.user.id);
    if (cart.length === 0) {
      AsyncStorage.removeItem(key);
      return;
    }
    AsyncStorage.setItem(
      key,
      JSON.stringify({
        cart,
        customerId,
        newCustomerName,
        newCustomerPhone,
        discountType,
        discountValue,
        paymentMethod,
        amountPaid,
        amountPaidTouched,
        notes,
      }),
    );
  }, [
    business?.id,
    session?.user.id,
    cart,
    customerId,
    newCustomerName,
    newCustomerPhone,
    discountType,
    discountValue,
    paymentMethod,
    amountPaid,
    amountPaidTouched,
    notes,
  ]);

  function loadCustomers() {
    if (!business) return;
    supabase
      .from("customers")
      .select("id, name")
      .eq("business_id", business.id)
      .order("name")
      .then(({ data }) => setCustomers(data ?? []));
  }

  useEffect(() => {
    loadCustomers();
    if (!business) return;
    supabase
      .from("products")
      .select("id, name, selling_price, stock_quantity, unit_type, unit, pack_size, pack_price")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) console.log("Error fetching products:", error.message);
        setProducts(data ?? []);
      });
  }, [business?.id]);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function addToCart(p: Product) {
    // A tap on a search result adds one "natural" unit: one piece, one whole
    // pack, or (for weight items) a starting 1 so the cashier can edit it to
    // the real amount.
    const startQty = p.unit_type === "pack" ? (p.pack_size ?? 1) : 1;
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        return prev.map((c) =>
          c.product_id === p.id ? { ...c, quantity: c.quantity + startQty } : c,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          unit_price: p.selling_price,
          quantity: startQty,
          unit_type: p.unit_type,
          unit: p.unit,
          pack_size: p.pack_size,
          pack_price: p.pack_price,
        },
      ];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setQtyText((prev) => {
      const { [productId]: _omit, ...rest } = prev;
      return rest;
    });
    setCart((prev) =>
      prev
        .map((c) => (c.product_id === productId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  }

  // For pack-type items: delta is in whole packs or in single loose units.
  function changePackCount(productId: string, deltaPacks: number) {
    setQtyText((prev) => {
      const { [productId]: _omit, ...rest } = prev;
      return rest;
    });
    setCart((prev) =>
      prev
        .map((c) =>
          c.product_id === productId && c.pack_size
            ? { ...c, quantity: c.quantity + deltaPacks * c.pack_size }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  }

  function setQuantityText(productId: string, text: string) {
    setQtyText((prev) => ({ ...prev, [productId]: text }));
    const num = parseFloat(text);
    if (!isNaN(num) && num >= 0) {
      setCart((prev) => prev.map((c) => (c.product_id === productId ? { ...c, quantity: num } : c)));
    }
  }

  function clearQuantityText(productId: string) {
    setQtyText((prev) => {
      const { [productId]: _omit, ...rest } = prev;
      return rest;
    });
  }

  function removeFromCart(productId: string) {
    clearQuantityText(productId);
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  }

  async function handleAddNewProduct() {
    if (!business) return;
    const price = parseFloat(newProductPrice);
    const cost = newProductCost.trim() ? parseFloat(newProductCost) : 0;
    const qty = parseInt(newProductQty, 10) || 1;
    if (!newProductName.trim()) {
      return showAlert("Missing info", "Enter the product's name.");
    }
    if (isNaN(price) || price < 0) {
      return showAlert("Missing info", "Enter a valid selling price.");
    }
    if (isNaN(cost) || cost < 0) {
      return showAlert("Missing info", "Enter a valid cost price, or leave it blank.");
    }

    setCreatingProduct(true);
    const { data: newProduct, error } = await supabase
      .from("products")
      .insert({
        business_id: business.id,
        name: newProductName.trim(),
        selling_price: price,
        cost_price: cost,
        stock_quantity: qty,
        low_stock_threshold: 5,
      })
      .select("id, name, selling_price, stock_quantity")
      .single();
    setCreatingProduct(false);
    if (error) {
      showAlert("Error", error.message);
      return;
    }

    const fullProduct: Product = { ...newProduct, unit_type: "each", unit: null, pack_size: null, pack_price: null };
    setProducts((prev) => [...prev, fullProduct]);
    addToCart(fullProduct);
    if (qty !== 1) {
      setQuantityText(newProduct.id, String(qty));
    }
    setNewProductName("");
    setNewProductPrice("");
    setNewProductCost("");
    setNewProductQty("1");
    setAddingProduct(false);
  }

  const validCart = cart.filter((c) => c.quantity > 0);
  const subtotal = validCart.reduce((sum, c) => sum + cartItemSubtotal(c), 0);
  const discountNum = parseFloat(discountValue) || 0;
  const discountAmount = discountType === "percentage" ? (subtotal * discountNum) / 100 : discountNum;
  const total = Math.max(0, subtotal - discountAmount);

  useEffect(() => {
    if (!amountPaidTouched) setAmountPaid(total.toFixed(2));
  }, [total, amountPaidTouched]);

  const amountPaidNum = Math.max(0, parseFloat(amountPaid) || 0);
  const due = Math.max(0, total - amountPaidNum);

  function resetFormForNextSale() {
    setCart([]);
    setQtyText({});
    setCustomerId("");
    setNewCustomerName("");
    setNewCustomerPhone("");
    setDiscountType("flat");
    setDiscountValue("0");
    setPaymentMethod("cash");
    setAmountPaid("0");
    setAmountPaidTouched(false);
    setNotes("");
  }

  async function printOfflineReceipt(label: string, format: "a4" | "thermal") {
    if (!business) return;
    const selectedCustomer = customers.find((c) => c.id === customerId);
    try {
      await generateAndShareInvoice(
        { name: business.name, phone: business.phone, address: business.address, logo_url: business.logo_url },
        customerId === "__new__" && newCustomerName.trim()
          ? { name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null }
          : selectedCustomer
            ? { name: selectedCustomer.name, phone: null }
            : null,
        {
          order_number: `${label} — PENDING SYNC`,
          created_at: new Date().toISOString(),
          subtotal,
          discount: discountAmount,
          total,
          amount_paid: amountPaidNum,
          cashier_name: (session?.user.user_metadata?.full_name as string) ?? null,
        },
        validCart.map((c) => ({
          name: c.name,
          quantity: c.quantity,
          unit_price: c.unit_price,
          subtotal: cartItemSubtotal(c),
          unit_type: c.unit_type,
          unit: c.unit,
          pack_size: c.pack_size,
        })),
        format,
      );
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Could not generate the receipt.");
    }
  }

  async function handleSave(printFormat?: "a4" | "thermal") {
    if (!business || !session) return;
    if (validCart.length === 0)
      return showAlert("No products", "Add at least one product to the order.");
    if (customerId === "__new__" && !newCustomerName.trim()) {
      return showAlert("Missing info", "Enter the new customer's name.");
    }
    if (!customerId && isLessThanAmount(amountPaidNum, total)) {
      return showAlert(
        "Customer required",
        "Walk-in orders must be paid in full. Select a customer to record a partial payment or credit sale.",
      );
    }

    for (const item of validCart) {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) continue;
      const alreadyQueued = isConnected
        ? 0
        : await getQueuedQuantityForProduct(business.id, session.user.id, item.product_id);
      if (item.quantity + alreadyQueued > product.stock_quantity) {
        return showAlert(
          "Not enough stock",
          alreadyQueued > 0
            ? `${item.name} only has ${formatQuantity(product.stock_quantity, product)} in stock as of the last update, and ${formatQuantity(alreadyQueued, item)} is already waiting to sync from another sale on this device.`
            : `${item.name} only has ${formatQuantity(product.stock_quantity, product)} in stock, but ${formatQuantity(item.quantity, item)} ${item.unit_type === "each" && item.quantity === 1 ? "was" : "were"} added.`,
        );
      }
    }

    if (!isConnected) {
      setSaving(true);
      const pending = await addPendingOrder(business.id, session.user.id, {
        customerId: customerId || null,
        newCustomerName,
        newCustomerPhone,
        discountType,
        discountValue: discountNum,
        notes: notes.trim(),
        items: validCart.map((c) => ({
          product_id: c.product_id,
          product_name: c.name,
          quantity: c.quantity,
          unit_price_override:
            c.unit_type === "pack" ? effectiveUnitPrice(c.quantity, cartItemSubtotal(c), c.unit_price) : undefined,
        })),
        paymentMethod,
        amountPaid: amountPaidNum,
        totalEstimate: total,
      });
      await refreshOfflineSync();

      if (printFormat) {
        await printOfflineReceipt(pending.local_label, printFormat);
      }
      setSaving(false);
      showAlert(
        "Saved Offline",
        `${pending.local_label} — ${formatCurrency(total)}. Kept safely on this device and will sync automatically once you're back online.`,
      );
      resetFormForNextSale();
      return;
    }

    setSaving(true);

    let finalCustomerId = customerId || null;
    if (customerId === "__new__" && business) {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          business_id: business.id,
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || null,
        })
        .select("id")
        .single();
      if (customerError) {
        setSaving(false);
        showAlert("Error", customerError.message);
        return;
      }
      finalCustomerId = newCustomer.id;
    }

    const { data: orderId, error } = await supabase.rpc("create_order", {
      p_business_id: business.id,
      p_customer_id: finalCustomerId,
      p_discount_type: discountType,
      p_discount_value: discountNum,
      p_notes: notes.trim() || null,
      p_items: validCart.map((c) => ({
        product_id: c.product_id,
        quantity: c.quantity,
        unit_price_override:
          c.unit_type === "pack" ? effectiveUnitPrice(c.quantity, cartItemSubtotal(c), c.unit_price) : undefined,
      })),
      p_payment_method: paymentMethod,
      p_amount_paid: amountPaidNum,
    });
    setSaving(false);
    if (error) {
      if (error.message.includes("stock_quantity_check")) {
        showAlert(
          "Not enough stock",
          "One of these items doesn't have enough stock left — someone may have just sold it. Please review the order and try again.",
        );
        return;
      }
      showAlert("Error", error.message);
      return;
    }

    if (business && session) AsyncStorage.removeItem(draftKeyFor(business.id, session.user.id));

    if (printFormat) {
      await printReceipt(orderId, printFormat);
    } else {
      router.back();
    }
  }

  async function printReceipt(orderId: string, format: "a4" | "thermal") {
    if (!business) return;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "order_number, created_at, subtotal, discount, total, amount_paid, customers(name, phone), creator:profiles!created_by(full_name)",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) console.log("Error fetching order for invoice:", orderError.message);
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("quantity, unit_price, subtotal, products(name, unit_type, unit, pack_size)")
      .eq("order_id", orderId);
    if (itemsError) console.log("Error fetching order items for invoice:", itemsError.message);

    if (order) {
      try {
        await generateAndShareInvoice(
          { name: business.name, phone: business.phone, address: business.address, logo_url: business.logo_url },
          (order as any).customers
            ? { name: (order as any).customers.name, phone: (order as any).customers.phone }
            : null,
          {
            order_number: order.order_number,
            created_at: order.created_at,
            subtotal: order.subtotal,
            discount: order.discount,
            total: order.total,
            amount_paid: order.amount_paid,
            cashier_name: (order as any).creator?.full_name ?? null,
          },
          (items ?? []).map((item: any) => ({
            name: item.products?.name ?? "Product",
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
            unit_type: item.products?.unit_type,
            unit: item.products?.unit,
            pack_size: item.products?.pack_size,
          })),
          format,
        );
      } catch (e: any) {
        showAlert("Error", e?.message ?? "Could not generate the receipt.");
      }
    } else {
      showAlert("Order saved", "The order was saved, but the invoice couldn't be generated. You can print it from the order's details screen.");
    }
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Customer</Text>
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={customerId} onValueChange={setCustomerId}>
          <Picker.Item label="Walk-in (no customer)" value="" />
          {can(permissions, "customers", "add") && (
            <Picker.Item label="+ Add New Customer" value="__new__" />
          )}
          {customers.map((c) => (
            <Picker.Item key={c.id} label={c.name} value={c.id} />
          ))}
        </Picker>
      </View>
      {customerId === "__new__" && (
        <View style={styles.newCustomerBox}>
          <TextInput
            style={styles.input}
            placeholder="New customer name *"
            value={newCustomerName}
            onChangeText={setNewCustomerName}
          />
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Phone (optional)"
            keyboardType="phone-pad"
            value={newCustomerPhone}
            onChangeText={setNewCustomerPhone}
          />
        </View>
      )}

      <View style={styles.labelRow}>
        <Text style={styles.label}>Add Products</Text>
        {canAddProduct && !addingProduct && (
          <Pressable onPress={() => setAddingProduct(true)}>
            <Text style={styles.addProductLink}>+ Add New Product</Text>
          </Pressable>
        )}
      </View>
      {addingProduct ? (
        <View style={styles.newCustomerBox}>
          <TextInput
            style={styles.input}
            placeholder="Product name *"
            value={newProductName}
            onChangeText={setNewProductName}
          />
          <View style={{ flexDirection: "row" }}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: theme.spacing.sm }]}
              placeholder="Selling price *"
              keyboardType="decimal-pad"
              value={newProductPrice}
              onChangeText={setNewProductPrice}
            />
            <TextInput
              style={[styles.input, { width: 90 }]}
              placeholder="Qty"
              keyboardType="number-pad"
              value={newProductQty}
              onChangeText={setNewProductQty}
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Cost price (optional, for profit reports)"
            keyboardType="decimal-pad"
            value={newProductCost}
            onChangeText={setNewProductCost}
          />
          <View style={{ flexDirection: "row" }}>
            <Button
              title={creatingProduct ? "Adding..." : "Add to Order"}
              size="sm"
              loading={creatingProduct}
              onPress={handleAddNewProduct}
              style={{ flex: 1, marginRight: theme.spacing.sm }}
            />
            <Button
              title="Cancel"
              size="sm"
              variant="ghost"
              onPress={() => {
                setAddingProduct(false);
                setNewProductName("");
                setNewProductPrice("");
                setNewProductQty("1");
              }}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={styles.newProductHint}>
            This adds it to your Products list too — you can fix the category, cost price, etc. later.
          </Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search products..."
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <View style={styles.searchResults}>
              {filteredProducts.slice(0, 5).map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.searchRow}
                  onPress={() => {
                    addToCart(p);
                    setSearch("");
                  }}
                >
                  <Text style={styles.searchRowText}>
                    {p.name} — {formatCurrency(p.selling_price)}
                    {p.unit_type === "weight" ? `/${p.unit}` : p.unit_type === "pack" ? `/${p.unit}` : ""}
                    {" "}({formatQuantity(p.stock_quantity, p)} in stock)
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      <Text style={styles.label}>Order Items</Text>
      {cart.length === 0 ? (
        <Text style={styles.empty}>No products added yet.</Text>
      ) : (
        cart.map((item) => {
          const subtotalAmt = cartItemSubtotal(item);
          const pack = item.unit_type === "pack" ? splitPacks(item.quantity, item.pack_size ?? 1) : null;
          return (
            <View key={item.product_id} style={styles.cartRow}>
              <View style={styles.cartRowTop}>
                <Text style={styles.cartName}>{item.name}</Text>
                <Pressable style={styles.removeButton} onPress={() => removeFromCart(item.product_id)}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.cartRowBottom}>
                <Text style={styles.cartSubtotal}>{formatCurrency(subtotalAmt)}</Text>

                {item.unit_type === "each" && (
                  <View style={styles.qtyRow}>
                    <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, -1)}>
                      <Text style={styles.qtyButtonText}>−</Text>
                    </Pressable>
                    <TextInput
                      style={styles.qtyInput}
                      keyboardType="number-pad"
                      value={qtyText[item.product_id] ?? String(item.quantity)}
                      onChangeText={(v) => setQuantityText(item.product_id, v)}
                      onBlur={() => clearQuantityText(item.product_id)}
                      selectTextOnFocus
                    />
                    <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, 1)}>
                      <Text style={styles.qtyButtonText}>+</Text>
                    </Pressable>
                  </View>
                )}

                {item.unit_type === "weight" && (
                  <View style={styles.qtyRow}>
                    <TextInput
                      style={[styles.qtyInput, { width: 64 }]}
                      keyboardType="decimal-pad"
                      value={qtyText[item.product_id] ?? String(item.quantity)}
                      onChangeText={(v) => setQuantityText(item.product_id, v)}
                      onBlur={() => clearQuantityText(item.product_id)}
                      selectTextOnFocus
                    />
                    <Text style={styles.unitSuffix}>{item.unit}</Text>
                  </View>
                )}

                {item.unit_type === "pack" && pack && (
                  <View>
                    <View style={styles.packStepperRow}>
                      <Pressable style={styles.qtyButton} onPress={() => changePackCount(item.product_id, -1)}>
                        <Text style={styles.qtyButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.packStepperValue}>
                        {pack.packs} pack{pack.packs === 1 ? "" : "s"}
                      </Text>
                      <Pressable style={styles.qtyButton} onPress={() => changePackCount(item.product_id, 1)}>
                        <Text style={styles.qtyButtonText}>+</Text>
                      </Pressable>
                    </View>
                    <View style={styles.packStepperRow}>
                      <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, -1)}>
                        <Text style={styles.qtyButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.packStepperValue}>
                        {pack.loose} {item.unit}
                        {pack.loose === 1 ? "" : "s"}
                      </Text>
                      <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product_id, 1)}>
                        <Text style={styles.qtyButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}

      <Text style={styles.label}>Discount</Text>
      <SegmentedControl options={DISCOUNT_TYPES} value={discountType} onChange={setDiscountType} />
      <TextInput
        style={styles.input}
        placeholder="Discount amount"
        keyboardType="decimal-pad"
        value={discountValue}
        onChangeText={setDiscountValue}
      />

      <TextInput
        style={[styles.input, { height: 70 }]}
        placeholder="Notes (optional)"
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <Text style={styles.label}>Payment Method</Text>
      <SegmentedControl options={PAYMENT_METHODS} value={paymentMethod} onChange={setPaymentMethod} />

      <Text style={styles.label}>Amount Paid</Text>
      <TextInput
        style={styles.input}
        placeholder="Amount Paid"
        keyboardType="decimal-pad"
        value={amountPaid}
        onChangeText={(v) => {
          setAmountPaidTouched(true);
          setAmountPaid(v);
        }}
      />

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <Text style={styles.summaryValue}>{formatCurrency(discountAmount)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelBold}>Total</Text>
          <Text style={styles.summaryValueBold}>{formatCurrency(total)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <Text style={styles.summaryValue}>{formatCurrency(amountPaidNum)}</Text>
        </View>
        {due > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.warning }]}>Due</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.warning, fontWeight: "700" }]}>
              {formatCurrency(due)}
            </Text>
          </View>
        )}
      </View>

      <Button
        title={saving ? "Saving..." : isConnected ? "Save Order" : "Save Order (Offline)"}
        onPress={() => handleSave()}
        loading={saving}
        style={{ marginTop: theme.spacing.lg }}
      />

      <Button
        title={isConnected ? "Save & Generate A4 Invoice" : "Save Offline & Print A4 Receipt"}
        variant="outline"
        onPress={() => handleSave("a4")}
        loading={saving}
        style={{ marginTop: theme.spacing.sm }}
      />

      <Button
        title={isConnected ? "Save & Generate Thermal Invoice" : "Save Offline & Print Thermal Receipt"}
        variant="outline"
        onPress={() => handleSave("thermal")}
        loading={saving}
        style={{ marginTop: theme.spacing.sm }}
      />

      <Text style={styles.hint}>
        {isConnected
          ? "Saving completes the sale immediately and updates stock."
          : "You're offline — this sale will be saved on this device and synced automatically once you're back online."}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  addProductLink: { color: theme.colors.primary, fontWeight: "600", fontSize: 13 },
  newProductHint: { color: theme.colors.muted, fontSize: 11, marginTop: theme.spacing.xs },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  newCustomerBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  searchResults: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.sm,
  },
  searchRow: { padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  searchRowText: { color: theme.colors.text },
  empty: { color: theme.colors.muted, marginBottom: theme.spacing.sm },
  cartRow: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cartRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cartRowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing.xs,
  },
  cartName: { color: theme.colors.text, fontWeight: "600", flex: 1 },
  qtyRow: { flexDirection: "row", alignItems: "center" },
  packStepperRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  packStepperValue: { width: 90, textAlign: "center", color: theme.colors.text, fontWeight: "600", fontSize: 12 },
  unitSuffix: { marginLeft: theme.spacing.xs, color: theme.colors.muted, fontWeight: "600" },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyButtonText: { fontSize: 20, fontWeight: "700", color: theme.colors.text },
  qtyInput: {
    width: 48,
    marginHorizontal: theme.spacing.xs,
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
  },
  cartSubtotal: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  removeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: theme.spacing.xs,
  },
  removeButtonText: { color: theme.colors.error, fontSize: 18, fontWeight: "700" },
  discountRow: { flexDirection: "row", marginTop: theme.spacing.md },
  summary: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: theme.spacing.xs },
  summaryLabel: { color: theme.colors.muted },
  summaryValue: { color: theme.colors.text },
  summaryLabelBold: { color: theme.colors.text, fontWeight: "700" },
  summaryValueBold: { color: theme.colors.text, fontWeight: "700" },
  hint: { color: theme.colors.muted, fontSize: 12, textAlign: "center", marginTop: theme.spacing.sm },
});
