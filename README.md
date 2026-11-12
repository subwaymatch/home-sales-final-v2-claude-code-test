# College-town home sales

A data website about 35,442 home sales around 11 university campuses in 18 cities and towns. Every number on the site is computed in your browser from the dataset when the page loads. Nothing is typed in by hand.

## Live site

https://subwaymatch.github.io/home-sales-final-v2-claude-code-test/

The site is published with GitHub Pages from the `main` branch. If the address does not load, check that Pages is set to publish from GitHub Actions in the repository settings.

## What the site shows

- **Key findings and contents** at the top of the page.
- **Explore:** filters for area, year, bedrooms, price, living area and home features, with key numbers, a map of the cities, two charts, a results table and a comparison of two areas.
- **Q1 to Q10:** ten questions about the data, each with a written answer, a chart and a table. Q7 to Q10 have their own controls.
- **Insights:** P1 shows how the valid price rule changes the results. P2 is coming soon.
- **Data and methods:** the rules used, how missing values are handled, and the citation.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The page: its structure and text |
| `assets/app.js` | All the calculations, filters, charts and map |
| `assets/styles.css` | The palette, typography and layout |
| `data/college_town_home_sales.csv` | The dataset, read by the page |
| `data/college_town_home_sales.xlsx`, `.sqlite`, `.duckdb`, `.parquet` | The same data in other formats, with identical values |
| `docs/data_description_sheet.md` | What each column means, and the known problems in the data |
| `scripts/` | Scripts that check the page's numbers with a second computation |
| `AGENTS.md` | Project instructions for the AI coding agent |
| `AGENT_LOG.md` | A log of the work with the AI coding agent |
| `.github/workflows/pages.yml` | Publishes the repository's files to GitHub Pages on each push to `main` |

The dataset files are not edited. Any file made from them is saved under a new name, with the script that makes it in `scripts/`.

## Checking the numbers

Two scripts compute figures a second way, using only Python's standard library. Run them from the repository root:

```bash
python3 scripts/check_q1_q6.py
python3 scripts/check_p1_price_rule.py
```

The first prints the Q1 to Q6 answers. The second prints the before-and-after figures for the valid price rule in P1.

## Data notes

- **Valid price:** a sale price from $10,000 to $5,000,000, inclusive. Every figure uses it except Q2, Q3 and Q9, which use all rows as their questions state. The rule removes 71 sales, and no row is deleted from the dataset.
- **Days on market:** contract date minus list date, in days, for rows with both dates. A blank date is not counted as zero.
- **Blank values:** home features (garage, basement, fireplace) that are blank are treated as unknown, not as "no". A blank living area is unknown. A blank sale date leaves a sale out of year-based results.
- **Years and months** come from the sale date.
- **Street addresses are not unique.** Rows are never removed for sharing an address; `listing_id` is the key.
- **Medians** are used unless a question asks for a mean. Ties are reported in full.
- **Rounding:** dollars to whole dollars; days, miles and percents to one decimal; half up.
- The values are as reported by the collection source and were not checked against county records. See `docs/data_description_sheet.md` for the full list of known problems.

## Tools used

- **Claude Code**, an AI coding agent, with the project instructions in `AGENTS.md`.
- **Chart.js 4.4.1** for the charts, and **Leaflet 1.9.4** with OpenStreetMap and CARTO map tiles for the map. Both load from a CDN by script tag.
- **Google Fonts:** Source Serif 4 for headings and Source Sans 3 for text and numbers, both under the SIL Open Font License.
- **Python 3** with the standard library for the check scripts.
- **GitHub Pages** and **GitHub Actions** for publishing.

## Citation

College-town home sales dataset, version 1.0 (2026). University of Illinois-Deloitte Foundation Center for Business Emerging Technologies. Data collected March 2026.
