# Scripts

These scripts check the numbers on the site with a second computation that does not share code with the page.

| Script | What it checks |
|---|---|
| `check_q1_q6.py` | The fixed answers Q1 to Q6 |
| `check_p1_price_rule.py` | The before-and-after figures for the valid price rule in P1 |

Run them from the repository root, for example `python3 scripts/check_q1_q6.py`. Each one reads `data/college_town_home_sales.csv`, uses only Python's standard library, and prints its results. None of them writes files.
