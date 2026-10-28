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
  function Harness() {
    const [v, setV] = useState<"a" | "b" | "c">("a");
    return <Segmented label="Letter" value={v} onChange={setV} options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Gamma" }]} />;
  }

  it("is a labelled radio group that switches on click", async () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Letter" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Beta" }));
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("aria-checked", "true");
  });

  it("is one tab stop, moved with the arrow keys", async () => {
    render(<Harness />);
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    screen.getByRole("radio", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Gamma" })).toHaveFocus(); // wraps around
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("aria-checked", "true");
  });
});
