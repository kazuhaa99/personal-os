import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/sora";
import { MotionConfig } from "framer-motion";
import { Navigate, Route, Routes } from "react-router-dom";
import { Compare } from "./Compare";
import { Gallery } from "./Gallery";
import { Viewer } from "./Viewer";
import "./lab.css";

/**
 * Design Lab — an isolated exploration area. It never calls the API and never
 * mutates real data; all figures are shared sample data labelled as demo.
 */
export default function DesignLab() {
  return (
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route index element={<Gallery />} />
        <Route path="compare" element={<Compare />} />
        <Route path=":conceptId" element={<Viewer />} />
        <Route path="*" element={<Navigate to="/design-lab" replace />} />
      </Routes>
    </MotionConfig>
  );
}
