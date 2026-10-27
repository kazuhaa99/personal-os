import { describe, expectTypeOf, it } from "vitest";
import type { Ref, Transaction } from "./types";

// Compile-time checks (npm run typecheck): the transaction's type decides which links it has.
describe("Transaction", () => {
  it("narrows by type", () => {
    const destination = (tx: Transaction) => (tx.type === "transfer" ? tx.to_account : null);
    expectTypeOf(destination).returns.toEqualTypeOf<Ref | null>();
    const transferOnly = (tx: Extract<Transaction, { type: "transfer" }>) => tx.to_account;
    expectTypeOf(transferOnly).returns.toEqualTypeOf<Ref>();
    expectTypeOf<Extract<Transaction, { type: "transfer" }>["category"]>().toEqualTypeOf<null>();
    expectTypeOf<Exclude<Transaction, { type: "transfer" }>["to_account"]>().toEqualTypeOf<null>();
  });
});
