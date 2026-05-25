// Basic-strategy chart as raw data. Mirrors tests/reference-chart.md cell-for-cell.
// Variant: 6 decks, dealer Stands on Soft 17, Double After Split allowed, Late Surrender allowed.
//
// Each row is indexed by dealer upcard 2..10, A. The leading comment header is the
// dealer upcard for that column — keep it aligned so a human can scan the chart.
//
// Cell codes:
//   H  = Hit
//   S  = Stand
//   D  = Double if 2-card hand, else Hit
//   Ds = Double if 2-card hand, else Stand
//   P  = Split
//   R  = Surrender if 2-card hand and LS on, else Hit

export const DEALER_UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Hard totals 5..20 (21 always stands; below 5 is impossible with two cards).
export const hardTotals = {
  //  dealer:    2    3    4    5    6    7    8    9   10    A
  5:           ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6:           ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7:           ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8:           ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9:           ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10:          ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11:          ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'], // S17: 11 vs A = H
  12:          ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13:          ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14:          ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15:          ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'R', 'H'], // S17: 15 vs A = H
  16:          ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'R', 'R', 'R'], // vs A = R (S17, LS): solver EV R=-0.50 beats H=-0.52
  17:          ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  18:          ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19:          ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20:          ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
};

// Soft totals: hand contains an Ace counted as 11. Keyed by hand total (13..20).
export const softTotals = {
  //  dealer:    2    3    4    5    6    7    8    9   10    A
  13:          ['H', 'H', 'H', 'H', 'D', 'H', 'H', 'H', 'H', 'H'], // A,2 — vs 5: solver EV H=+0.133 beats D=+0.126
  14:          ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,3
  15:          ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,4 — vs 4: solver EV H=+0.059 beats D=+0.058
  16:          ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,5
  17:          ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,6
  18:          ['S', 'Ds','Ds','Ds','Ds','S', 'S', 'H', 'H', 'H'], // A,7 — S17: vs 2 = S
  19:          ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'], // A,8 — S17: vs 6 = S
  20:          ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'], // A,9
};

// Pairs keyed by card rank as a string. 'A' for Aces, '10' for any ten-value card.
// DAS on. (5,5 row equals hard 10 — pair table still encodes it so the lookup is uniform.)
export const pairs = {
  //  dealer:    2    3    4    5    6    7    8    9   10    A
  '2':         ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  '3':         ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  '4':         ['H', 'H', 'H', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  '5':         ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'], // never split — treat as hard 10
  '6':         ['P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  '7':         ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  '8':         ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  '9':         ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
  '10':        ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  'A':         ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
};
