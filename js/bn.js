/* বাংলা সংখ্যা ও তারিখ — Bengali numerals, dates and small formatting helpers.
   Global: window.BN */
(function (w) {
  "use strict";

  var DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  var MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
                "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
  var WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

  /* 64 -> "৬৪" */
  function num(n) {
    return String(n).replace(/[0-9]/g, function (d) { return DIGITS[+d]; });
  }

  /* 47.3 -> "৪৭.৩" (places default 0) */
  function dec(n, places) {
    var p = places == null ? 0 : places;
    var s = Number(n).toFixed(p);
    return num(s);
  }

  /* thousands separated, in Bengali digits: 147570 -> "১,৪৭,৫৭০" is not used;
     the Indian/Bengali grouping is lakh/crore, so we keep it simple: full digits. */
  function group(n) {
    return num(Number(n).toLocaleString("en-IN"));
  }

  function pct(n, places) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    if (v > 0 && v < 1) return dec(v, places == null ? 1 : places);
    return dec(v, places);
  }

  /* Date -> "৯ অক্টোবর ২০২৬" */
  function date(d) {
    d = d || new Date();
    return num(d.getDate()) + " " + MONTHS[d.getMonth()] + " " + num(d.getFullYear());
  }

  /* Date -> "৯ অক্টোবর ২০২৬, শুক্রবার" */
  function dateFull(d) {
    d = d || new Date();
    return date(d) + ", " + WEEKDAYS[d.getDay()];
  }

  /* 0-100 -> "৩২%" */
  function percent(n) { return num(Math.round(n)) + "%"; }

  function timeNow(d) {
    d = d || new Date();
    var h = d.getHours(), m = d.getMinutes();
    var am = h < 12;
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return num(h12) + ":" + num(String(m).padStart(2, "0")) + " " + (am ? "সকাল" : "বিকাল");
  }

  w.BN = {
    DIGITS: DIGITS, MONTHS: MONTHS, WEEKDAYS: WEEKDAYS,
    num: num, dec: dec, group: group, pct: pct, date: date, dateFull: dateFull,
    percent: percent, timeNow: timeNow,
    /* "৬৪ জেলার ৩২টি" — a small counter phrase used in the UI and the posters */
    districtCountPhrase: function (n) { return num(n); }
  };
})(window);
