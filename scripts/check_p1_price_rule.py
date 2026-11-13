#!/usr/bin/env python3
"""Computes the numbers for the Insights section, P1 "Data quality".

It compares every sale with the price range (sale_price from 10,000 to 5,000,000, inclusive)
against all rows, for each city and for the whole dataset. The page computes the same numbers in
the browser (assets/app.js). Run it from the repository root:

    python3 scripts/check_p1_price_rule.py

Standard library only. Dollars are rounded to whole dollars, percents to one decimal, half up.
"""

import csv
import os
import statistics
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "data", "college_town_home_sales.csv")
PRICE_MIN, PRICE_MAX = 10_000, 5_000_000


def half_up(value, places=0):
    quantum = Decimal(1).scaleb(-places)
    return Decimal(repr(value)).quantize(quantum, rounding=ROUND_HALF_UP)


def dollars(value):
    return "${:,}".format(int(half_up(value, 0)))


def pct(value):
    return "{}%".format(half_up(value, 1))


def load():
    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as handle:
        for raw in csv.DictReader(handle):
            price = int(raw["sale_price"])
            rows.append({
                "city": raw["city"] + ", " + raw["state"],
                "price": price,
                "valid": PRICE_MIN <= price <= PRICE_MAX,
            })
    return rows


def ranks_by_mean(means):
    # Rank 1 is the highest mean. Ties share the same rank.
    ordered = sorted(means, key=lambda c: -means[c])
    out = {}
    for city in ordered:
        out[city] = 1 + sum(1 for other in means if means[other] > means[city])
    return out


def main():
    rows = load()
    below = [r for r in rows if r["price"] < PRICE_MIN]
    above = [r for r in rows if r["price"] > PRICE_MAX]
    valid = [r for r in rows if r["valid"]]
    print(f"Rows: {len(rows):,}")
    print(f"Below $10,000: {len(below):,} (lowest price {dollars(min(r['price'] for r in below))})")
    print(f"Above $5,000,000: {len(above):,} (highest price {dollars(max(r['price'] for r in above))})")
    print(f"Removed by the rule: {len(below) + len(above):,}")
    print(f"Valid rows: {len(valid):,}")
    print()

    all_prices = [r["price"] for r in rows]
    valid_prices = [r["price"] for r in valid]
    print("Whole dataset")
    print(f"  mean   before {dollars(statistics.fmean(all_prices))}   after {dollars(statistics.fmean(valid_prices))}")
    print(f"  median before {dollars(statistics.median(all_prices))}   after {dollars(statistics.median(valid_prices))}")
    print()

    by_all = defaultdict(list)
    by_valid = defaultdict(list)
    for r in rows:
        by_all[r["city"]].append(r["price"])
    for r in valid:
        by_valid[r["city"]].append(r["price"])
    cities = sorted(by_all)

    mean_before = {c: statistics.fmean(by_all[c]) for c in cities}
    mean_after = {c: statistics.fmean(by_valid[c]) for c in cities}
    rank_before = ranks_by_mean(mean_before)
    rank_after = ranks_by_mean(mean_after)

    print("Per city (before = all rows, after = valid prices)")
    print(f"{'City':<22}{'Removed':>8}{'Mean before':>14}{'Mean after':>13}{'Mean chg':>10}"
          f"{'Med before':>12}{'Med after':>11}{'Med chg':>9}{'Rank b':>8}{'Rank a':>8}")
    results = []
    for c in cities:
        removed = len(by_all[c]) - len(by_valid[c])
        mb = mean_before[c]
        ma = mean_after[c]
        medb = statistics.median(by_all[c])
        meda = statistics.median(by_valid[c])
        mean_chg = (ma - mb) / mb * 100
        med_chg = (meda - medb) / medb * 100
        results.append((c, removed, mb, ma, mean_chg, medb, meda, med_chg))
        print(f"{c:<22}{removed:>8,}{dollars(mb):>14}{dollars(ma):>13}{pct(mean_chg):>10}"
              f"{dollars(medb):>12}{dollars(meda):>11}{pct(med_chg):>9}"
              f"{rank_before[c]:>8}{rank_after[c]:>8}")
    print()

    changed = [c for c in cities if rank_before[c] != rank_after[c]]
    print(f"Cities whose mean rank changes: {len(changed)}")
    for c in sorted(changed, key=lambda c: rank_before[c]):
        print(f"  {c}: {rank_before[c]} -> {rank_after[c]} ({rank_before[c] - rank_after[c]:+d} places)")
    print()

    biggest_mean = max(results, key=lambda t: abs(t[4]))
    biggest_med = max(results, key=lambda t: abs(t[7]))
    print(f"Largest mean change: {biggest_mean[0]} {pct(biggest_mean[4])}")
    print(f"Largest median change: {biggest_med[0]} {pct(biggest_med[7])}")
    print(f"Cities whose median moves by less than 1%: "
          f"{sum(1 for t in results if abs(t[7]) < 1)} of {len(results)}")
    print(f"Cities whose mean moves by more than 5%: "
          f"{sum(1 for t in results if abs(t[4]) > 5)} of {len(results)}")


if __name__ == "__main__":
    main()
