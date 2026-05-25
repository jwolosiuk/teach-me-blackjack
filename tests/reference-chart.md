# Basic Strategy Reference Chart

**Source of truth for `js/strategy-table.js` and `tests/strategy.test.html`.**

Rules variant: **6 decks · Dealer stands on soft 17 (S17) · Double after split allowed (DAS) · Late surrender allowed (LS) · Blackjack pays 3:2.**

Source: Wizard of Odds basic-strategy calculator, https://wizardofodds.com/games/blackjack/strategy/calculator/ (parameters above).

## Legend

| Symbol | Meaning                                              |
|--------|------------------------------------------------------|
| H      | Hit                                                  |
| S      | Stand                                                |
| D      | Double if allowed (2-card hand), else Hit            |
| Ds     | Double if allowed (2-card hand), else Stand          |
| P      | Split                                                |
| R      | Surrender (2-card hand, LS on), else Hit             |

Rows are the player total (or pair rank). Columns are the dealer upcard 2–10 and A.

## Hard totals

|  Total | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|-------:|---|---|---|---|---|---|---|---|----|---|
|      5 | H | H | H | H | H | H | H | H | H  | H |
|      6 | H | H | H | H | H | H | H | H | H  | H |
|      7 | H | H | H | H | H | H | H | H | H  | H |
|      8 | H | H | H | H | H | H | H | H | H  | H |
|      9 | H | D | D | D | D | H | H | H | H  | H |
|     10 | D | D | D | D | D | D | D | D | H  | H |
|     11 | D | D | D | D | D | D | D | D | D  | H |
|     12 | H | H | S | S | S | H | H | H | H  | H |
|     13 | S | S | S | S | S | H | H | H | H  | H |
|     14 | S | S | S | S | S | H | H | H | H  | H |
|     15 | S | S | S | S | S | H | H | H | R  | H |
|     16 | S | S | S | S | S | H | H | R | R  | H |
|     17 | S | S | S | S | S | S | S | S | S  | S |
|     18 | S | S | S | S | S | S | S | S | S  | S |
|     19 | S | S | S | S | S | S | S | S | S  | S |
|     20 | S | S | S | S | S | S | S | S | S  | S |

S17 notes (where S17 differs from H17):
- **11 vs A → H** under S17 (H17 chart says D).
- **15 vs A → H** under S17 (H17 chart says R).
- **16 vs A → H** under S17 (H17 chart says R).
- **17 vs A → S** under S17 (H17 chart says R).

## Soft totals (one ace counted as 11)

|  Total | 2 | 3 | 4 | 5 | 6  | 7 | 8 | 9 | 10 | A |
|-------:|---|---|---|---|----|---|---|---|----|---|
| 13 (A,2) | H  | H  | H  | D  | D  | H | H | H | H | H |
| 14 (A,3) | H  | H  | H  | D  | D  | H | H | H | H | H |
| 15 (A,4) | H  | H  | D  | D  | D  | H | H | H | H | H |
| 16 (A,5) | H  | H  | D  | D  | D  | H | H | H | H | H |
| 17 (A,6) | H  | D  | D  | D  | D  | H | H | H | H | H |
| 18 (A,7) | S  | Ds | Ds | Ds | Ds | S | S | H | H | H |
| 19 (A,8) | S  | S  | S  | S  | S  | S | S | S | S | S |
| 20 (A,9) | S  | S  | S  | S  | S  | S | S | S | S | S |

S17 notes:
- **A,7 vs 2 → S** under S17 (H17 chart says Ds).
- **A,8 vs 6 → S** under S17 (H17 chart says Ds).

## Pairs (DAS on)

|  Pair  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|-------:|---|---|---|---|---|---|---|---|----|---|
|  2,2   | P | P | P | P | P | P | H | H | H  | H |
|  3,3   | P | P | P | P | P | P | H | H | H  | H |
|  4,4   | H | H | H | P | P | H | H | H | H  | H |
|  5,5   | D | D | D | D | D | D | D | D | H  | H |
|  6,6   | P | P | P | P | P | H | H | H | H  | H |
|  7,7   | P | P | P | P | P | P | H | H | H  | H |
|  8,8   | P | P | P | P | P | P | P | P | P  | P |
|  9,9   | P | P | P | P | P | S | P | P | S  | S |
| 10,10  | S | S | S | S | S | S | S | S | S  | S |
|  A,A   | P | P | P | P | P | P | P | P | P  | P |

DAS notes (changes without DAS):
- **2,2 vs 2,3 → H** without DAS (with DAS → P).
- **3,3 vs 2,3 → H** without DAS (with DAS → P).
- **4,4 vs 5,6 → H** without DAS (with DAS → P).
- **6,6 vs 2 → H** without DAS (with DAS → P).

5,5 is never split — treated as hard 10 (the row is identical to hard 10 except 5,5 vs 10/A use H per the printed chart, matching hard 10).
