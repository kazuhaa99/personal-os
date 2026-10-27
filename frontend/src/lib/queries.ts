import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "./api";
import { haptic } from "@/platform/native";
import type { Account, Category, Settings } from "./types";
import { setAppTimeZone } from "@/lib/format";
import { affects, type Area } from "./refresh";

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts") });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories"), staleTime: 60_000 });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings").then((s) => { setAppTimeZone(s.timezone); return s; }), staleTime: 60_000 });
}

/**
 * Mutation with consistent feedback. A successful write refreshes the views of its `refresh`
 * areas (lib/refresh.ts): several, since a transaction changes balances, budgets, analytics and the
 * overview. Unlisted, it refreshes everything (settings, demo data).
 */
export interface ActionOptions<TResult> {
  success?: string | ((r: TResult) => string);
  onSuccess?: (r: TResult) => void;
  haptic?: "light" | "success";
  refresh?: readonly Area[];
}

export function useAction<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, opts: ActionOptions<TResult> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      if (opts.haptic) void haptic(opts.haptic); // iPhone only; a no-op elsewhere
      const stale = affects(opts.refresh ?? ["everything"]);
      qc.invalidateQueries({ predicate: (q) => stale(q.queryKey) });
      const msg = typeof opts.success === "function" ? opts.success(result) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(result);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
