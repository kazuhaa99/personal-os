import { Fingerprint, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { biometricStatus, biometricVerify, type BiometricStatus } from "@/platform/native";
import { biometricLockEnabled, setBiometricLockEnabled } from "@/components/native/BiometricLock";
import { Card, CardHeader, Segmented } from "@/components/ui/primitives";

/** Native apps: optional Face ID / Touch ID lock. Turning it on asks once, so it can't lock you out. */
export function AppLockCard() {
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [on, setOn] = useState(biometricLockEnabled);
  useEffect(() => { void biometricStatus().then(setStatus); }, []);
  if (!status) return null;

  const name = status.kind === "face" ? t("Face ID") : t("Touch ID");
  const Icon = status.kind === "face" ? ScanFace : Fingerprint;
  const change = async (next: boolean) => {
    if (next && !(await biometricVerify(t("Turn on the app lock")))) return;
    setBiometricLockEnabled(next);
    setOn(next);
    toast.success(next ? t("App lock is on") : t("App lock is off"));
  };

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Icon className="h-4 w-4 text-ink-3" /> {t("App lock")}</span>}
        subtitle={status.available ? t("Ask for {method} when the app opens or comes back after a minute.", { method: name }) : t("Set up Face ID or Touch ID on this device to use the app lock.")} />
      {status.available && (
        <div className="px-5 pb-5">
          <Segmented label={t("App lock")} value={on ? "on" : "off"} onChange={(v) => void change(v === "on")}
            options={[{ value: "off", label: t("Off") }, { value: "on", label: t("On") }]} />
        </div>
      )}
    </Card>
  );
}
