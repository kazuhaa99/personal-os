import type { Dict } from "../../i18n";
import { auth } from "./auth";
import { common } from "./common";
import { money } from "./money";
import { more } from "./more";
import { planning } from "./planning";
import { shell } from "./shell";

export const dict: Dict = { ...common, ...shell, ...planning, ...money, ...more, ...auth };
