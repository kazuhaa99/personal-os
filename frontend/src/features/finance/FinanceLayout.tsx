import { Outlet } from "react-router-dom";

/** Finance sections are listed in the sidebar (Money group); this route only hosts them. */
export function FinanceLayout() {
  return <Outlet />;
}
