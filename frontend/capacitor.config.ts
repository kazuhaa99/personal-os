import type { CapacitorConfig } from "@capacitor/cli";

// iOS shell (Capacitor). The interface is the same React app built with VITE_PLATFORM=ios into
// dist-ios (npm run build:ios); see src/platform for what is native-only.
const config: CapacitorConfig = {
  appId: "com.kazuhaa99.personalos",
  appName: "Personal OS",
  webDir: "dist-ios",
  ios: {
    // The app lays itself out with env(safe-area-inset-*) (index.css --sat/--sab/...): no automatic insets.
    contentInset: "never",
    backgroundColor: "#0a0a0e",
  },
  plugins: {
    Keyboard: { resize: "native", resizeOnFullScreen: true },
    StatusBar: { overlaysWebView: true },
  },
};

export default config;
