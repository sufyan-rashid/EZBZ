import { openWhatsApp } from "./whatsapp";

export const SUPPORT_WHATSAPP_NUMBER = "923452778711";

export function openSupportWhatsApp(message: string) {
  openWhatsApp(SUPPORT_WHATSAPP_NUMBER, message);
}
