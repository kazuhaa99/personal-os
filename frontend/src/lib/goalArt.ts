import { asset } from "./base";
/** Category cover photography for goals (bundled in /public/media, see CREDITS.md). */
const ART: Record<string, string> = {
  finance: asset("/media/ocean.jpg"),
  health: asset("/media/moraine.jpg"),
  career: asset("/media/city.jpg"),
  creative: asset("/media/maple.jpg"),
  personal: asset("/media/walker.jpg"),
  other: asset("/media/bridge.jpg"),
};
export const goalArt = (category: string) => ART[category] ?? ART.other;
