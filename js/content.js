/* আমার ৬৪ — the Bengali words of the app, kept as plain data.
   Global: window.A64C (read by js/app.js, its map and its exporters).
   Script order: bn.js -> content.js -> ... -> app.js, so nothing here
   may touch A64 — this file only ships copy. */
(function (w) {
  "use strict";

  /* ------------------------------------------------------------- divisions
     The 8 English keys exactly as they appear in data/districts.json,
     in the order the rail and the seals are shown. */
  var divisionOrder = [
    "Dhaka",
    "Mymensingh",
    "Sylhet",
    "Chattogram",
    "Barishal",
    "Khulna",
    "Rajshahi",
    "Rangpur"
  ];

  /* ------------------------------------------------------------- the ladder
     Ascending rungs from 0 to 64 visited jela. Each rung: min (count that
     first reaches it), a short title, and one warm line. The last rung is
     the grandest — the whole country, the ledger full. */
  var ranks = [
    {
      min: 0,
      bn: "পথচারী",
      note: "খাতা এখনো ফাঁকা — প্রথম জেলায় দাগ দিলেই আপনার পথের গল্প শুরু হবে।"
    },
    {
      min: 1,
      bn: "পথিক",
      note: "প্রথম দাগ পড়ে গেছে; এখন থেকে প্রতিটি ভ্রমণই এই খাতায় জমা হবে।"
    },
    {
      min: 3,
      bn: "ভ্রমণকারী",
      note: "কয়েকটি জেলা চোখে লাগল; দেশটা ধীরে ধীরে আপনার চেনা হয়ে উঠছে।"
    },
    {
      min: 6,
      bn: "পরিব্রাজক",
      note: "ছয় জেলা পেরিয়ে পথের ছন্দটা এখন আপনার নিজের হয়ে গেছে।"
    },
    {
      min: 10,
      bn: "দেশভ্রমণকারী",
      note: "দশ জেলায় দাগ পড়েছে; খাতায় দেশের ছবিটা ফুটতে শুরু করেছে।"
    },
    {
      min: 16,
      bn: "অভিযাত্রী",
      note: "ষোলো জেলা মানে দেশের অনেকটা পথ; এখন দিগন্তই আপনার গন্তব্য।"
    },
    {
      min: 24,
      bn: "দিগন্তবিহারী",
      note: "চব্বিশ জেলার পথ পেরিয়ে এসেছেন — আপনার খাতা এখন নিজেই কথা বলে।"
    },
    {
      min: 32,
      bn: "অর্ধদেশভ্রমী",
      note: "অর্ধেক দেশ ঘুরে ফেলেছেন; বাকিটা এখন নিছক হেঁটে যাওয়ার দূরত্ব।"
    },
    {
      min: 48,
      bn: "প্রায়-সম্পূর্ণ বঙ্গভ্রমী",
      note: "প্রায় সারা দেশ ছুঁয়ে ফেলেছেন; আর মাত্র কয়েকটি দাগ বাকি।"
    },
    {
      min: 64,
      bn: "সমগ্র দেশের পথিক",
      note: "ষাটচার জেলা শেষ — আপনার খাতায় এখন সারা দেশ আঁকা, আর পথটা অমর।"
    }
  ];

  /* Which rung a visited count falls on. Any integer 0–64 lands on a rung;
     counts outside that range clamp to the first or the last rung. */
  function rankFor(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    var r = ranks[0];
    for (var i = 0; i < ranks.length; i++) {
      if (v >= ranks[i].min) r = ranks[i];
      else break;
    }
    return r;
  }

  /* -------------------------------------------------------------- divisions
     One or two true, warm lines about travelling through each division.
     No invented figures — just what the place is actually like. */
  var divisionNotes = {
    "Dhaka": "দেশের মধ্যভাগে ছড়িয়ে থাকা সবুজ মাঠ, ছোট নদী আর ঘন জনবসতি — মাঝখানে রাজধানী ঢাকা। এখানে শহুরে কোলাহল আর গ্রামীণ নদীতীর পাশাপাশি মেলে।",
    "Mymensingh": "ব্রহ্মপুত্রের দুই তীর ঘিরে গড়া উত্তর-মধ্য বঙ্গ; ময়মনসিংহের ছোট নদী আর বিস্তীর্ণ ধানখেত। সোমেশ্বরী আর পুরনো নদীঘাট ধরে হাঁটলে গ্রামীণ বাংলার আসল রূপ চোখে পড়ে।",
    "Sylhet": "সিলেট দেশের উত্তর-পূর্ব কোণে — চা-বাগান, টিলা আর সুরমা-কুশিয়ারার পানি। ভোরে কুয়াশার ভেতর সবুজ বাগানের সারি দেখতে দেখতে পথ কেটে যায়।",
    "Chattogram": "চট্টগ্রাম দেশের দক্ষিণ-পূর্বে — পাহাড়, সমুদ্র আর বন্দর; রাঙামাটি-বান্দরবানের টিলা থেকে কক্সবাজারের দীর্ঘ সমুদ্রসৈকত। দেশের সবচেয়ে উঁচু পাহাড় এখানেই।",
    "Barishal": "বরিশাল দক্ষিণের নদীবহুল ব-দ্বীপ, যেখানে নৌকা আর খেয়াতেই পথ চলা। ভোলার দ্বীপ, ছোট ছোট চর আর খোলা আকাশ — সমুদ্রের গন্ধমাখা এক জনপদ।",
    "Khulna": "খুলনা দক্ষিণ-পশ্চিমে সুন্দরবনের প্রবেশপথ আর খরস্রোতা নদীর দেশ। ম্যানগ্রোভের ভেতরে হরিণ, গোলপাতা আর জোয়ারের পথ — ভ্রমণ এখানে একটু বেশি রোমাঞ্চকর।",
    "Rajshahi": "রাজশাহী উত্তর-পশ্চিমে পদ্মার তীর ঘেঁষে গড়া আম আর লিচুর বাগানের দেশ, সঙ্গে সিল্কের পুরনো ঐতিহ্য। নদীর চর আর পাকা ফলের গন্ধ এখানে পথকে মিষ্টি করে তোলে।",
    "Rangpur": "রংপুর দেশের উত্তর প্রান্তে — তিস্তা-ধরলার তীর আর বিস্তীর্ণ ধানক্ষেত। কুড়িগ্রামে ব্রহ্মপুত্রের চর, দিনাজপুর-ঠাকুরগাঁওয়ের ফসলের মাঠ — শীতের সবজিতে ভরা এক প্রান্তর।"
  };

  /* ------------------------------------------------------------------ about */
  var about = "আমার ৬৪ এক ছোট ভ্রমণ খাতা। ম্যাপে যে জেলায় গেছেন, সেখানে দাগ দিলে আপনার হিসাব নিজে থেকেই জমে — কত জেলা হলো, দেশের কতটা আয়তন, কোন বিভাগ শেষ। কিছুই সার্ভারে যায় না, সব আপনার ব্রাউজারেই থাকে; শেষে ছবি বা পোস্টার করে পুরো খাতা নামিয়ে রাখতে পারেন।";

  /* ------------------------------------------------------------------- tips */
  var tips = [
    "জেলায় ক্লিক করে দাগ দিন, আবার ক্লিক করলে মিলিয়ে যাবে।",
    "গেছি আর যেতে চাই — দুই ধরনের দাগ আলাদা করে রাখা যায়।",
    "কাজ জমে গেলে লিংক কপি করে দাগ সংরক্ষণ করুন।",
    "শেষে ছবি বা পোস্টার বানিয়ে নামিয়ে রাখুন।"
  ];

  /* -------------------------------------------------------------- storyCopy
     Templates for the story card. {n} is the visited count (Bengali digits),
     {pct} is the country's area percentage (Bengali digits). */
  var storyCopy = {
    title: "আমার ৬৪",
    sub: "{n} জেলায় দাগ — আমার ভ্রমণের খাতা",
    stat: "দেশের {pct}% আয়তন ঘুরে দেখা হয়েছে"
  };

  /* -------------------------------------------------------------- emptyState */
  var emptyState = "খাতা এখনো ফাঁকা — ম্যাপে প্রথম জেলায় চাপ দিয়ে দাগ দেওয়া শুরু করুন।";

  w.A64C = {
    divisionOrder: divisionOrder,
    ranks: ranks,
    rankFor: rankFor,
    divisionNotes: divisionNotes,
    about: about,
    tips: tips,
    storyCopy: storyCopy,
    emptyState: emptyState
  };
})(window);
