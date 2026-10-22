# FIDE Live Rating

Type a player's name to see their official FIDE ratings plus an estimated **live** rating, calculated from
tournaments on chess-results.com that FIDE hasn't put into a monthly list yet.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit + parser tests (offline, uses test/fixtures)
```

## How it works

1. **FIDE** (`lib/fide.ts`): name search, profile, rating history (for the K-factor and the latest list date) and
   FIDE's own per-period calculations (to know which tournaments are already rated).
2. **chess-results** (`lib/chessResults.ts`): player search by FIDE ID (ASP.NET form postback), the player's
   tournament card, and tournament details + starting list (replaying the "Show tournament details" postback).
3. **Live logic** (`lib/live.ts`): looks at tournaments that ended since the start of the previous list month. Test
   events, future events and tournaments already in FIDE's calculations (matched by FIDE event ID, or by date and
   name) are excluded. Opponents' FIDE ratings are looked up on ratings.fide.com by their FIDE ID, because
   chess-results often shows national ratings.
4. **Maths** (`lib/elo.ts`): FIDE expected-score table with the 400-point cap, K = 40/20/10 for standard (K = 20 for
   rapid and blitz) and the K × n ≤ 700 cap. All pending games are rated from the published rating, as FIDE does.

Every tournament can be ticked or unticked on the player page, and the totals update instantly.

Scraped responses are cached in memory for 15 minutes, with at most 3 concurrent requests per site.
Live ratings are unofficial estimates.
