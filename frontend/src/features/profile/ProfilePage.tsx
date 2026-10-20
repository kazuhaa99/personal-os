import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { ErrorBlock, LoadingBlock } from "@/components/ui/primitives";
import { IncomeSection } from "./IncomeCard";
import { MonthlySummary } from "./MonthlySummary";
import { PersonalCard } from "./PersonalCard";
import { ProfileHero } from "./ProfileHero";
import { SecurityCard } from "./SecurityCard";
import { PROFILE_KEY } from "./shared";

const rise = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: 0.04 * i, ease: "easeOut" as const } });

export function ProfilePage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: PROFILE_KEY, queryFn: () => api.get<Profile>("/profile") });
  if (isLoading) return <LoadingBlock />;
  if (!data) return <ErrorBlock error={error} onRetry={() => refetch()} />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 min-w-0">
      <motion.div {...rise(0)}><ProfileHero profile={data} /></motion.div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-5 min-w-0">
          <motion.div {...rise(1)}><PersonalCard profile={data} /></motion.div>
          <motion.div {...rise(2)} className="space-y-5"><IncomeSection profile={data} /></motion.div>
        </div>
        <div className="space-y-5 min-w-0 lg:sticky lg:top-4">
          <motion.div {...rise(2)}><MonthlySummary monthly={data.monthly} /></motion.div>
          <motion.div {...rise(3)}><SecurityCard account={data.account} /></motion.div>
        </div>
      </div>
    </div>
  );
}
