/** Category cover photography for goals (bundled in /public/media, see CREDITS.md). */
const ART: Record<string, string> = {
  finance: "/media/ocean.jpg",
  health: "/media/moraine.jpg",
  career: "/media/city.jpg",
  creative: "/media/maple.jpg",
  personal: "/media/walker.jpg",
  other: "/media/bridge.jpg",
};
export const goalArt = (category: string) => ART[category] ?? ART.other;
