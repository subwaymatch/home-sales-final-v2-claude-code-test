#!/usr/bin/env python3
"""Second, independent computation of the fixed answers Q1 to Q6.

The site computes these in the browser (index.html). This script uses only the Python
standard library, so the two implementations share no code. Run it from the repository root:

    python3 scripts/check_q1_q6.py

It reads data/college_town_home_sales.csv and prints every figure the page shows.
Rules (from AGENTS.md):
  - Price range: 10,000 <= sale_price <= 5,000,000 (Q1, Q3, Q4, Q5, Q6). Q2 and Q9 use all rows.
  - Q6 tax rule: 0 < tax_annual_amount < 10% of sale_price, on rows in the price range.
  - City = city + state, e.g. "Champaign, IL". Campus area = university column.
  - Days on market = contract_date - list_date, in days, only rows with both dates.
  - Year and month come from sale_date.
  - Median unless a question asks for a mean. Ties are reported in full.
  - Dollars are rounded to whole dollars; days, miles and percents to one decimal (half up).
"""

import csv
import datetime as dt
import os
import statistics
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "data", "college_town_home_sales.csv")
PRICE_MIN, PRICE_MAX = 10_000, 5_000_000


def half_up(value, places):
    quantum = Decimal(1).scaleb(-places)
    return float(Decimal(repr(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def dollars(value):
    return f"${int(Decimal(repr(value)).quantize(Decimal(1), rounding=ROUND_HALF_UP)):,}"


def one_dp(value):
    return f"{half_up(value, 1):,.1f}"


def parse_date(text):
    return dt.date.fromisoformat(text) if text else None


def load_rows():
    # zipcode, county_fips and parcel_number stay text; this script does not use them.
    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as handle:
        for raw in csv.DictReader(handle):
            price = int(raw["sale_price"]) if raw["sale_price"] else None
            tax = float(raw["tax_annual_amount"]) if raw["tax_annual_amount"] else None
            rows.append({
                "id": raw["listing_id"],
                "city": f'{raw["city"]}, {raw["state"]}',
                "university": raw["university"],
                "price": price,
                "valid": price is not None and PRICE_MIN <= price <= PRICE_MAX,
                "tax": tax,
                "list": parse_date(raw["list_date"]),
                "contract": parse_date(raw["contract_date"]),
                "sale_date": parse_date(raw["sale_date"]),
            })
    return rows


def ties_at_extreme(items, pick_max):
    """items: list of (name, value). Returns every name tied at the max or min value."""
    target = max(v for _, v in items) if pick_max else min(v for _, v in items)
    return [n for n, v in items if v == target]


def main():
    rows = load_rows()
    print(f"Rows read: {len(rows):,}")
    valid_rows = [r for r in rows if r["valid"]]
    print(f"Valid-price rows: {len(valid_rows):,}")
    print()

    # Q1
    by_city_valid = defaultdict(list)
    for r in valid_rows:
        by_city_valid[r["city"]].append(r["price"])
    print("Q1. Median sale price by city (prices from $10,000 to $5,000,000)")
    q1 = sorted(((c, statistics.median(p), len(p)) for c, p in by_city_valid.items()),
                key=lambda t: -t[1])
    for city, med, n in q1:
        print(f"  {city:<22} {dollars(med):>12}  n={n:,}")
    top = ties_at_extreme([(c, m) for c, m, _ in q1], pick_max=True)
    print(f"  Highest median: {', '.join(top)}")
    print()

    # Q2
    by_city_all = defaultdict(list)
    for r in rows:
        if r["price"] is not None:
            by_city_all[r["city"]].append(r["price"])
    print("Q2. Mean vs median by city (all rows, no price rule)")
    q2 = []
    for city, prices in by_city_all.items():
        mean = statistics.fmean(prices)
        med = statistics.median(prices)
        gap = (mean - med) / med * 100
        q2.append((city, mean, med, gap, len(prices)))
        print(f"  {city:<22} mean {dollars(mean):>14}  median {dollars(med):>12}  gap {one_dp(gap)}%  n={len(prices):,}")
    best = max(q2, key=lambda t: t[3])
    print(f"  Largest gap: {best[0]} at {one_dp(best[3])}%")
    top_prices = sorted(by_city_all[best[0]], reverse=True)[:3]
    print(f"  {best[0]} three largest prices: {', '.join(dollars(p) for p in top_prices)}")
    print(f"  {best[0]} sales over $5,000,000: {sum(1 for p in by_city_all[best[0]] if p > PRICE_MAX):,}")
    print(f"  {best[0]} sales under $10,000: {sum(1 for p in by_city_all[best[0]] if p < PRICE_MIN):,}")
    print()

    # Q3
    mean_all = {c: statistics.fmean(p) for c, p in by_city_all.items()}
    mean_valid = {c: statistics.fmean(p) for c, p in by_city_valid.items()}
    rank_all = {c: i + 1 for i, c in enumerate(sorted(mean_all, key=lambda c: -mean_all[c]))}
    rank_valid = {c: i + 1 for i, c in enumerate(sorted(mean_valid, key=lambda c: -mean_valid[c]))}
    print("Q3. Rank by mean sale price (1 = highest): all rows vs valid prices")
    for city in sorted(rank_all, key=lambda c: rank_all[c]):
        delta = rank_all[city] - rank_valid[city]
        note = "" if delta == 0 else f"  moved {abs(delta)} {'up' if delta > 0 else 'down'}"
        print(f"  {city:<22} all {rank_all[city]:>2}  valid {rank_valid[city]:>2}{note}")
    print()

    # Q4
    by_uni_year = defaultdict(list)
    for r in valid_rows:
        if r["sale_date"] and r["sale_date"].year in (2024, 2025):
            by_uni_year[(r["university"], r["sale_date"].year)].append(r["price"])
    unis = sorted({r["university"] for r in rows})
    print("Q4. Median sale price by campus area, 2024 vs 2025 (valid prices, sale year)")
    q4 = []
    for u in unis:
        m24 = statistics.median(by_uni_year[(u, 2024)])
        m25 = statistics.median(by_uni_year[(u, 2025)])
        pct = (m25 - m24) / m24 * 100
        q4.append((u, m24, m25, pct))
        print(f"  {u:<50} 2024 {dollars(m24):>10}  2025 {dollars(m25):>10}  change {one_dp(pct)}%"
              f"  (n24={len(by_uni_year[(u, 2024)]):,}, n25={len(by_uni_year[(u, 2025)]):,})")
    inc = ties_at_extreme([(u, p) for u, _, _, p in q4], pick_max=True)
    decreases = [u for u, _, _, p in q4 if p < 0]
    print(f"  Largest increase: {', '.join(inc)}")
    print(f"  Decreases: {', '.join(decreases) if decreases else 'none'}")
    print()

    # Q5
    dom_by_uni = defaultdict(list)
    for r in valid_rows:
        if r["list"] and r["contract"]:
            dom_by_uni[r["university"]].append((r["contract"] - r["list"]).days)
    print("Q5. Median days on market by campus area (valid prices, both dates present)")
    q5 = []
    for u in unis:
        med = statistics.median(dom_by_uni[u])
        q5.append((u, med))
        print(f"  {u:<50} {half_up(med, 1):>6.1f} days  n={len(dom_by_uni[u]):,}")
    slow = ties_at_extreme(q5, pick_max=True)
    fast = ties_at_extreme(q5, pick_max=False)
    print(f"  Slowest: {', '.join(slow)}")
    print(f"  Fastest: {', '.join(fast)}")
    print()

    # Q6: aggregate ratio per campus area: sum of tax over sum of sale price, as a percent.
    # Rows: sale_price from 10,000 to 5,000,000 inclusive, tax_annual_amount > 0 and < 10% of sale price.
    tax_sum = defaultdict(float)
    price_sum = defaultdict(float)
    n_used = defaultdict(int)
    for r in valid_rows:
        if r["tax"] is not None and 0 < r["tax"] < 0.10 * r["price"]:
            tax_sum[r["university"]] += r["tax"]
            price_sum[r["university"]] += r["price"]
            n_used[r["university"]] += 1
    print("Q6. Aggregate annual tax as a percent of sale price, by campus area (sum of tax / sum of price)")
    q6 = []
    for u in unis:
        ratio = tax_sum[u] / price_sum[u] * 100
        q6.append((u, ratio))
        print(f"  {u:<50} {one_dp(ratio)}%  n={n_used[u]:,}  tax ${tax_sum[u]:,.2f}  price ${price_sum[u]:,.0f}")
    print(f"  Highest burden: {', '.join(ties_at_extreme(q6, pick_max=True))}")
    print(f"  Lowest burden: {', '.join(ties_at_extreme(q6, pick_max=False))}")


if __name__ == "__main__":
    main()
