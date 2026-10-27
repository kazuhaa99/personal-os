// Apply the saved/system appearance before first paint to avoid a theme flash.
try {
  var m = localStorage.getItem("pos.theme") || "system";
  var dark = m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // Colours taken from the wallpaper last time (theme.tsx), so the first paint already matches.
  var c = JSON.parse(localStorage.getItem("pos.colors") || "null");
  if (c && c.vars && c.theme === (dark ? "dark" : "light"))
    for (var k in c.vars) if (/^--(accent|accent-ink|tint)$/.test(k)) document.documentElement.style.setProperty(k, String(c.vars[k]));
} catch (e) { document.documentElement.dataset.theme = "light"; }
