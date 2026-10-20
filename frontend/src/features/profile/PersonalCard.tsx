import { useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useAction } from "@/lib/queries";
import type { Profile } from "@/lib/types";
import { Button, Card, CardHeader, cn, Field, Input, Textarea } from "@/components/ui/primitives";
import { PROFILE_KEY } from "./shared";

const BIO_MAX = 2000;
type Form = { first_name: string; last_name: string; phone: string; birthday: string; city: string; occupation: string; employer: string; bio: string };

const fromProfile = (p: Profile): Form => ({
  first_name: p.first_name, last_name: p.last_name, phone: p.phone, birthday: p.birthday ?? "",
  city: p.city, occupation: p.occupation, employer: p.employer, bio: p.bio,
});

export function PersonalCard({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const initial = useMemo(() => fromProfile(profile), [profile]);
  const [f, setF] = useState<Form>(initial);
  // A refetch (e.g. after saving income) must not wipe fields being edited: only untouched ones follow the server.
  const prev = useRef(initial);
  useEffect(() => {
    const old = prev.current;
    prev.current = initial;
    setF((s) => {
      const next = { ...s };
      for (const k of Object.keys(s) as (keyof Form)[]) if (s[k] === old[k]) next[k] = initial[k];
      return next;
    });
  }, [initial]);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const changed = (Object.keys(f) as (keyof Form)[]).filter((k) => f[k].trim() !== initial[k].trim());
  const save = useAction<Record<string, unknown>, Profile>((body) => api.patch<Profile>("/profile", body), {
    success: t("Profile saved"),
    onSuccess: (p) => { qc.setQueryData<Profile>(PROFILE_KEY, p); },
  });

  function submit() {
    const body: Record<string, unknown> = {};
    for (const k of changed) body[k] = k === "birthday" ? f.birthday || null : f[k].trim();
    save.mutate(body);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-ink-3" /> {t("Personal info")}</span>}
        subtitle={t("Your first name is also used in the greeting.")} />
      <form className="px-5 pb-5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (changed.length) submit(); }}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("First name")}>{(id) => <Input id={id} value={f.first_name} maxLength={80} autoComplete="given-name" onChange={set("first_name")} />}</Field>
          <Field label={t("Last name")}>{(id) => <Input id={id} value={f.last_name} maxLength={80} autoComplete="family-name" onChange={set("last_name")} />}</Field>
          <Field label={t("Phone")}>{(id) => <Input id={id} type="tel" inputMode="tel" value={f.phone} maxLength={32} autoComplete="tel" placeholder="+7 700 000 00 00" onChange={set("phone")} />}</Field>
          <Field label={t("Birthday")}>{(id) => <Input id={id} type="date" value={f.birthday} max={today} min="1900-01-01" onChange={set("birthday")} />}</Field>
          <Field label={t("City")}>{(id) => <Input id={id} value={f.city} maxLength={80} autoComplete="address-level2" onChange={set("city")} />}</Field>
          <Field label={t("Occupation")}>{(id) => <Input id={id} value={f.occupation} maxLength={120} autoComplete="organization-title" placeholder={t("e.g. Product designer")} onChange={set("occupation")} />}</Field>
          <Field label={t("Employer")} className="sm:col-span-2">{(id) => <Input id={id} value={f.employer} maxLength={120} autoComplete="organization" onChange={set("employer")} />}</Field>
        </div>
        <Field label={t("About me")} hint={
          <span className={cn("tnum", f.bio.length > BIO_MAX * 0.9 && "text-warn")}>{f.bio.length} / {BIO_MAX}</span>
        }>{(id) => <Textarea id={id} rows={4} value={f.bio} maxLength={BIO_MAX} placeholder={t("A few words about yourself")} onChange={set("bio")} className="resize-y" />}</Field>
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" variant="primary" disabled={!changed.length} loading={save.isPending}>{t("Save")}</Button>
          {changed.length > 0 && !save.isPending && (
            <Button variant="ghost" onClick={() => setF(initial)}>{t("Reset")}</Button>
          )}
        </div>
      </form>
    </Card>
  );
}
