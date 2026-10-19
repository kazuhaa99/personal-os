import { motion } from "framer-motion";
import { useState, type CSSProperties } from "react";
import { IMAGES, type ImageKey } from "../data";

/**
 * Art-directed photo with a graceful fallback: the image's sampled colour is
 * painted immediately (no layout jump) and stays as a soft gradient if the file
 * fails to load. Fades in once decoded.
 */
export function Photo({ name, className, style, position = "center", alt = "", grade, eager, layoutId }: {
  name: ImageKey; className?: string; style?: CSSProperties; position?: string; alt?: string;
  grade?: string; eager?: boolean; layoutId?: string;
}) {
  const img = IMAGES[name];
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <motion.div
      layoutId={layoutId}
      className={className}
      style={{
        position: "relative", overflow: "hidden",
        background: `radial-gradient(120% 90% at 30% 20%, ${img.color} 0%, color-mix(in srgb, ${img.color} 55%, #000) 100%)`,
        ...style,
      }}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      {state !== "error" && (
        <img
          src={img.src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: position,
            opacity: state === "ok" ? 1 : 0, transition: "opacity 600ms ease, transform 900ms cubic-bezier(.2,.7,.2,1)",
            transform: state === "ok" ? "scale(1)" : "scale(1.04)",
          }}
        />
      )}
      {grade && <div aria-hidden style={{ position: "absolute", inset: 0, background: grade, pointerEvents: "none" }} />}
    </motion.div>
  );
}
