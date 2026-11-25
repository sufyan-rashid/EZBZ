import { openWhatsApp } from "./whatsapp";

export const SUPPORT_WHATSAPP_NUMBER = "923452778711";

// Where customers send subscription payments.
export const PAYMENT_ACCOUNT = {
  title: "Sufiyan Rashid",
  number: "0300-2778713",
  methods: "EasyPaisa or JazzCash",
};

export function openSupportWhatsApp(message: string) {
  openWhatsApp(SUPPORT_WHATSAPP_NUMBER, message);
}
