import { Alert, Platform } from "react-native";
import { showWebAlert, AlertButton } from "../components/alert-host";

/**
 * React Native Web's Alert.alert is a no-op stub, so confirmation dialogs
 * silently do nothing on web. This shows a real in-app modal there instead,
 * while using the native Alert on iOS/Android.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  showWebAlert(title, message, buttons ?? [{ text: "OK" }]);
}
