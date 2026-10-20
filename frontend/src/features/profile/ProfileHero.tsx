import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Camera, Loader2, Mail, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { t } from "@/lib/i18n";
import type { Profile } from "@/lib/types";
import { useConfirm } from "@/components/ui/dialog";
import { Badge, cn, GlassCard } from "@/components/ui/primitives";
import { initials, PROFILE_KEY, squareJpeg } from "./shared";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

export function ProfileHero({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [imgFailed, setImgFailed] = useState<string | null>(null);
  const { account } = profile;

  const fullName = [profile.first_name, profile.last_name].map((s) => s.trim()).filter(Boolean).join(" ");
  const subline = [profile.occupation, profile.employer, profile.city].map((s) => s.trim()).filter(Boolean).join(" · ");
  const showImg = !!profile.avatar_url && imgFailed !== profile.avatar_url;

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy("upload");
    try {
      let blob: Blob;
      try {
        blob = await squareJpeg(file);
      } catch {
        throw new Error(t("That file isn't an image we can read"));
      }
      if (blob.size > 2 * 1024 * 1024) throw new Error(t("The photo is too large (max {mb} MB)", { mb: 2 }));
      const body = new FormData();
      body.append("file", blob, "avatar.jpg");
      const p = await api.put<Profile>("/profile/avatar", body);
      qc.setQueryData(PROFILE_KEY, p);
      toast.success(t("Photo updated"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy || !(await confirm({ title: t("Remove the profile photo?"), body: t("Your initials will be shown instead."), confirmLabel: t("Remove") }))) return;
    setBusy("remove");
    try {
      qc.setQueryData(PROFILE_KEY, await api.del<Profile>("/profile/avatar"));
      toast.success(t("Photo removed"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 text-center sm:text-left">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragEnter={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragging(true); } }}
            onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]); }}
            aria-label={profile.avatar_url ? t("Change photo") : t("Upload photo")}
            title={t("Click or drop a photo")}
            className={cn(
              "group relative block h-24 w-24 sm:h-28 sm:w-28 rounded-full overflow-hidden",
              "ring-1 ring-black/5 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] transition-shadow",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/50",
              dragging && "ring-[3px] ring-accent",
            )}
          >
            {showImg ? (
              <img src={profile.avatar_url!} alt="" className="h-full w-full object-cover" onError={() => setImgFailed(profile.avatar_url)} />
            ) : (
              <span className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#5ac8fa_0%,#007aff_45%,#af52de_100%)] text-3xl sm:text-4xl font-semibold tracking-tight text-white">
                {initials(profile.first_name, profile.last_name, account.username)}
              </span>
            )}
            <span className={cn(
              "absolute inset-0 grid place-items-center bg-black/40 text-white transition-opacity",
              busy || dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}>
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
            </span>
          </button>
          {profile.avatar_url && !busy && (
            <button type="button" onClick={() => void remove()} aria-label={t("Remove photo")} title={t("Remove photo")}
              className="absolute -right-0.5 bottom-0.5 grid h-8 w-8 place-items-center rounded-full mat-panel text-ink-2 hover:text-bad shadow-md transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload(f); }} />
        </div>

        <motion.div className="min-w-0 flex-1" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-ink break-words">{fullName || account.username}</h1>
          <p className="mt-0.5 text-sm text-ink-3">@{account.username}</p>
          {subline && <p className="mt-2 text-sm text-ink-2 break-words">{subline}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-sm">
            <Mail className="h-4 w-4 text-ink-3 shrink-0" />
            {account.email ? (
              <>
                <span className="text-ink-2 [overflow-wrap:anywhere]">{account.email}</span>
                <Badge tone={account.email_verified ? "good" : "warn"}>{account.email_verified ? t("Confirmed") : t("Not confirmed")}</Badge>
              </>
            ) : (
              <span className="text-ink-3">{t("No email")}</span>
            )}
          </div>
        </motion.div>
      </div>
      <p className="mt-4 text-2xs text-ink-3 text-center sm:text-left">{t("Click the photo or drop an image onto it. PNG, JPEG or WebP.")}</p>
    </GlassCard>
  );
}
