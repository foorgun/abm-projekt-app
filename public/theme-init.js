// Darstellung (hell/dunkel) vor dem ersten Rendern setzen, damit beim Start nichts flackert.
// Läuft synchron im <head>. Gleiche Regeln wie src/lib/theme.ts (Schlüssel "abm.darstellung", Werte hell/dunkel/system).
(function () {
  var pref = "system";
  try {
    var v = window.localStorage.getItem("abm.darstellung");
    if (v === "hell" || v === "dunkel" || v === "system") pref = v;
  } catch (e) {
    // ohne Speicher: Standard
  }
  var dark = pref === "dunkel" || (pref === "system" && (!window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches));
  var root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.style.colorScheme = dark ? "dark" : "light";
})();
