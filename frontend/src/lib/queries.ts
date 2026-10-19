import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "./api";
import type { Account, Category, Settings } from "./types";

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts") });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories"), staleTime: 60_000 });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings"), staleTime: 60_000 });
}

/**
 * Mutation with consistent feedback. Everything in Personal OS is connected
 * (a transaction changes balances, budgets, analytics and the dashboard), so a
 * successful write simply refreshes all active queries — cheap for one user.
 */
export function useAction<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      qc.invalidateQueries();
      const msg = typeof opts.success === "function" ? opts.success(result) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(result);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
