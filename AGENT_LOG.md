# Agent log

Add a dated entry each time you work with your AI coding agent, with the newest entry at the bottom. Each entry records what you asked the agent, what it produced, and what you checked or changed. Paste your key prompts in exactly as you typed them. Include at least one time the agent got something wrong, and how you caught it.

Copy this outline for each entry:

```markdown
## YYYY-MM-DD: What you worked on

- **Asked:** "Paste your prompt here."
- **Agent produced:** What it made or changed.
- **Checked or changed:** How you checked it, and what you fixed.
```

## 2026-11-12: Ten-question report page (index.html)

- **Asked:** "This is my final project. Read AGENTS.md and docs/data_description_sheet.md first. You have my approval to build this whole step without waiting for a plan review. When you are done, commit the changes and open a pull request into main.

Turn index.html into a long, report-style page that answers ten questions about the home sales data. Each question gets its own section, labeled Q1 to Q10. Each section needs a written answer that states the exact numbers, and a chart that shows the answer, with the key values labeled on the chart or shown in tooltips. Use at least three different chart types across the ten questions. When an answer is one city or a few cities, highlight those cities in an accent color in the chart and keep the rest in a quieter color.

Rules for every number:
- Valid price: sale_price between 10,000 and 5,000,000, inclusive. Q2 and Q3 say when to use all rows instead.
- Campus area means the university column (11 values). City means city and state together, for example "Champaign, IL" (18 values).
- Days on market is contract_date minus list_date in days, using only rows that have both dates. A blank date is not zero.
- Year and month come from sale_date.
- Use the median unless a question asks for the mean.
- Round dollars to whole dollars, days, miles and percents to one decimal.
- Never remove rows because two sales share a street address. listing_id is the key.
- When two or more cities or campus areas tie, report all of them.

Questions with fixed answers:
Q1. Which city has the highest median sale price? Show the median sale price of every city.
Q2. Using all rows (no price rule), which city's mean sale price is furthest above its median, as a percent of the median? Show the mean and median of every city, and explain in one or two sentences what causes the largest gap.
Q3. Rank the cities by mean sale price twice: once using all rows, and once using valid prices only. Which cities change rank, and by how many positions? Rank 1 is the highest mean.
Q4. For each campus area, what was the percent change in median sale price from 2024 to 2025? Which campus area had the largest increase, and which campus areas had a decrease?
Q5. For each campus area, what is the median days on market? Which campus area is the slowest, and which is the fastest?
Q6. For each campus area, what is the median annual property tax as a percent of the sale price? Use rows with a valid price and a tax_annual_amount greater than 0 and less than the sale price. Which campus area has the highest tax burden, and which has the lowest?

Interactive questions (the chart and the written answer must both update when the visitor changes the controls in that section; compute everything from the data, no fixed numbers; for Q8 and Q10 let the visitor type any amount, not only preset ranges):
Q7. For a selected number of bedrooms, which city has the lowest median sale price? Show every city's median sale price and number of sales for that bedroom count.
Q8. For a selected price range, which city has the shortest median days on market? Show every city's median days on market and the number of sales used.
Q9. For a selected city and year, how many sales were recorded in each month, January to December? Use all rows with a sale date. Identify the month with the most sales.
Q10. For a selected campus area, maximum budget, and minimum number of bedrooms, what is the median distance to campus (miles_to_campus), and how many sales meet the conditions?

Before you finish, compute the Q1 to Q6 answers a second way (for example with a short script in scripts/) and confirm the page shows the same numbers. Tell me the answers you got."
- **Agent produced:** `index.html`, rebuilt as a ten-section report. Each section has an answer, a chart and a table. Values are computed in the browser from `data/college_town_home_sales.csv`. Q7 to Q10 have controls that update the answer and chart. `scripts/check_q1_q6.py` is a second, stdlib-only computation of Q1 to Q6. Chart.js 4.4.1 is loaded from a script tag.
- **Checked or changed:** Ran the page in headless Chromium and changed every control. Compared Q1 to Q6 with the Python script, and Q7 to Q10 with one-off Python checks. Two problems were found and fixed. (1) The agent's first draft used the first tied city's sale count for every city in a Q8 tie, so it showed "from 742 sales" for two cities; the Python check showed Madison, WI had 2,814, and the wording was changed to list each city's count. (2) A value-label formatter was defined as a chart option, and Chart.js called it with a context object, which threw "Cannot convert object to primitive value"; the browser's page error log showed it, and the formatter moved to a registry. A series-label plugin also leaked onto the monthly chart; each plugin is now attached only to its own chart.

## 2026-11-12: Explore filters, map, comparison, sharing, themes

- **Asked:** Add filters for area, year, bedrooms and price; a clickable city map; a living-area slider with synced number inputs; garage, basement and fireplace filters with blanks treated as unknown; shareable links; a side-by-side comparison; a sortable results table; a responsive layout for 375 pixels and up; light and dark modes; and a data and methods section. Keep Q1 to Q10 working, and keep the Q1 to Q6 answers on the full dataset.
- **Agent produced:** A new `index.html`, `assets/app.js` and `assets/styles.css`. The Explore section has the filters, key numbers, a Leaflet map, two charts and a sortable table. The Compare section sets two areas side by side. Filter state is stored in the URL hash. The Data and methods section states the rules.
- **Checked or changed:** Ran the page in headless Chromium with changed filters, map clicks, slider and number inputs, sorting, comparison, copied-link reopening, and theme switching. Checked that Q1 to Q6 text is identical before and after changing the Explore filters, and that the page has no sideways overflow at 375, 768 and 1100 pixels in both themes. Found and fixed: a typed living-area minimum above the maximum left the slider and number box out of step (now clamped on commit), the summary read "with no filters", the comparison said "1 sales", and text columns in the results table were right-aligned.

## 2026-11-12: Insights P1, data quality and the valid price rule

- **Asked:** Add an Insights section after Q10 with P1 only: how the valid price rule ($10,000 to $5,000,000) changes the results for problem 3 in the data description sheet, with before and after figures by city, a rank comparison, a chart or table, and 150 to 300 words of explanation. Leave a P2 heading that says "Coming soon". Check the numbers with a script.
- **Agent produced:** An Insights section in `index.html`, with P1's text, table and grouped bar chart built by `assets/app.js`, and a P2 heading marked "Coming soon". `scripts/check_p1_price_rule.py` computes the same figures with the standard library.
- **Checked or changed:** Ran the script and compared its output with the page's table and prose: 71 rows removed (40 below $10,000, 31 above $5,000,000), the whole-dataset mean from $509,380 to $500,972, the median unchanged at $410,000, Athens, GA's mean down 7.3%, and three cities changing rank. The page prose is 236 words. Checked for page errors and sideways scrolling at 375 and 768 pixels. Found and fixed: the phone layout hid the median and rank columns, so the table now stacks into labelled blocks on narrow screens.

## 2026-11-12: Design round 1, typography and color

- **Asked:** Use free Google Fonts with a serif for headings and a clean sans for body text and numbers, with headings, body and captions easy to tell apart. Define a small palette of neutrals plus one or two accents as CSS variables, used for charts, the map, buttons, links and controls, with the accent kept for highlighted answer cities, in light and dark modes.
- **Agent produced:** Source Serif 4 for headings and Source Sans 3 for body text, numbers and captions, loaded from Google Fonts. One palette of neutrals, an orange accent for highlighted answer cities, and a teal accent for links, focus outlines, comparisons and secondary series, with matching light and dark values. Charts read the same palette, and the answer boxes now use the teal accent so the orange stays reserved for highlighted cities.
- **Checked or changed:** Ran the page in both themes: no page errors, no sideways overflow at 375, 768 or 1100 pixels, and the Q1 to Q6 answers unchanged. Confirmed the computed fonts and link colors in both themes. The sandbox cannot reach Google Fonts, so the screenshots show the fallback serif. The Google Fonts rendering has not been seen.

## 2026-11-12: Design round 2, controls and chart finish

- **Asked:** Style every control to match the site, with SVG sort icons that show the sorted column and direction, hover states and a visible keyboard focus outline. Give every chart a title and axis labels, formatted numbers, no overlapping or cut-off labels, tooltips in the site's style, and dark-mode support.
- **Agent produced:** Styled selects with a custom arrow, number inputs, teal sliders, buttons with hover and focus states, and a switch for dark mode. Sortable headers use inline SVG triangles. Each chart's title and axis titles come from one table in `assets/app.js`. Full-dollar and one-decimal percent tick labels, and tooltips that follow the palette in both themes.
- **Checked or changed:** Ran the browser checks: no page errors, no sideways overflow at 375, 768 or 1100 pixels, Q1 to Q6 unchanged, and the P1 figures unchanged. Looked at screenshots in both themes. Found and fixed: the dropdown arrows tiled across dark-mode selects (an older shorthand rule reset the arrow), table header words broke mid-word, long text ran under the dropdown arrow, and the default area label was truncated.

## 2026-11-12: Design round 3, layout and finishing touches

- **Asked:** Consistent spacing on a clear grid with a comfortable content width and clear section separation. A short summary with three key findings, and a contents list linking to each section. A loading message, a friendly message when filters match no sales, a real page title, consistent wording, and no template text. Check at 375, 768 and 1280 pixels in both themes.
- **Agent produced:** A spacing scale and a 72rem content width, with a 68-character measure for prose. A "Key findings" block with three findings computed from the data on each load, and a "Contents" list. A loading banner that is removed once the data is ready, and shows the error if loading fails. "No sales" in the key number when filters match nothing. A new page title. README and scripts README rewritten to describe the project, replacing the template text.
- **Checked or changed:** Ran the page at 375, 768 and 1280 pixels in both themes: no page errors and no sideways overflow. The findings match the earlier figures, and the Q1 to Q6 answers and P1 figures are unchanged. Found and fixed: the Q4 table pushed the phone page to 399 pixels wide (all tables now stack on phones), and the findings box stopped at the prose width on desktop.

## 2026-11-12: P2 and the README

- **Asked:** Replace the P2 placeholder with the heading "P2. Working with a coding agent" and the author's own text, exactly as written. Add a "How this site was built" section to the README, and update the Insights bullet so it no longer says P2 is coming soon.
- **Agent produced:** P2 in `index.html`, with the heading and four paragraphs matching the author's text character for character. A "How this site was built" section in `README.md`, and an updated Insights bullet.
- **Checked or changed:** Compared each P2 paragraph with the author's text in the file. Ran the page at 375, 768 and 1280 pixels in both themes: no page errors and no sideways overflow.
