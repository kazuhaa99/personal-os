import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MoneyText, Progress, Segmented } from "./primitives";

describe("MoneyText", () => {
  it("colours negative values when asked", () => {
    render(<MoneyText value="-12.50" currency="KZT" colored />);
    const el = screen.getByText(/12\.50/);
    expect(el.className).toContain("text-bad");
    expect(el.textContent).toContain("−");
  });
});

describe("Progress", () => {
  it("clamps and exposes value to assistive tech", () => {
    render(<Progress value={140} label="Budget" />);
    expect(screen.getByRole("progressbar", { name: "Budget" })).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("Segmented", () => {
  it("switches selection on click", async () => {
    function Harness() {
      const [v, setV] = useState<"a" | "b">("a");
      return <Segmented value={v} onChange={setV} options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />;
    }
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
  });
});
