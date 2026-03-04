// text2num.js — Converts text to gallery index
// Remove this <script> to disable text-to-number navigation
//
// Rules:
//   a=1, b=2 ... z=26
//   space = 0
//   ´ acute  → +1    ` grave   → -1
//   ¨ diaeresis → +2  ^ circumflex → +3
//   ¸ cedilla → +5    ° ring    → +10
//   ˇ caron  → -5    ~ tilde   → -10
//
// Result: sum modulo total tiles (wraps on negative)

(function () {
  const DIACRITIC_MOD = {
    '\u0301': 1,    // ´ acute
    '\u0300': -1,   // ` grave
    '\u0308': 2,    // ¨ diaeresis
    '\u0302': 3,    // ^ circumflex
    '\u0327': 5,    // ¸ cedilla
    '\u030A': 10,   // ° ring
    '\u030C': -5,   // ˇ caron
    '\u0303': -10,  // ~ tilde
  };

  function textToNumber(str, total) {
    let sum = 0;
    const chars = [...str.toLowerCase().normalize('NFD')];
    for (const ch of chars) {
      if (ch === ' ') continue;               // space = 0 (adds nothing)
      if (ch >= 'a' && ch <= 'z') {
        sum += ch.charCodeAt(0) - 96;          // a=1 ... z=26
      } else if (DIACRITIC_MOD[ch] != null) {
        sum += DIACRITIC_MOD[ch];              // modifier on previous letter
      }
    }
    return ((sum % total) + total) % total;    // wrap negatives
  }

  window.Gallery = window.Gallery || {};
  window.Gallery.textToNumber = textToNumber;
})();
