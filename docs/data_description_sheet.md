# College-town home sales: data description sheet

**35,442 home sales around 11 university campuses, in 18 cities and towns across 11 states.**
Data collected March 2026. One row per completed sale, with the dates the home was listed, went
under contract and closed.

Version 1.0. Available as CSV, Excel, SQLite, DuckDB and Parquet. Every format holds identical
values. In SQLite and DuckDB the table is named `home_sales` and the primary key is `listing_id`.

---

## What is in it

Each row is one home that sold, described by the attributes that appear in county assessor and
recorder records: where it is, when it was listed and sold, what it sold for, how big it is, when
it was built, and what it is assessed and taxed at.

The 14 college towns at the center of the collection, by number of rows:

| City | Rows | Median sale price |
|---|---:|---:|
| Gainesville, FL | 5,477 | $350,000 |
| Madison, WI | 5,061 | $421,000 |
| Lafayette, IN | 3,057 | $260,000 |
| Ann Arbor, MI | 3,021 | $571,000 |
| Athens, GA | 2,814 | $370,000 |
| Charlottesville, VA | 2,775 | $615,000 |
| Chapel Hill, NC | 2,716 | $735,000 |
| Champaign, IL | 2,286 | $240,000 |
| Iowa City, IA | 1,909 | $342,000 |
| West Lafayette, IN | 1,559 | $379,900 |
| State College, PA | 1,351 | $430,000 |
| Urbana, IL | 1,131 | $229,900 |
| Davis, CA | 941 | $889,000 |
| Middleton, WI | 645 | $611,000 |

Medians are of sales of $1,000 or more; see "Some prices are impossible" below.

Four smaller places round out the dataset: Savoy IL (247), Carrboro NC (208), Newberry FL (152)
and Pittsboro NC (92). Cities with fewer than 90 sales were dropped during the build, so every
city here has enough rows to analyse.

## Columns

| Column | Type | Filled | Description |
|---|---|---:|---|
| `listing_id` | text | 100% | Unique id for the row. Use this as the key, never the address. |
| `address_street` | text | 100% | Street address. **Not unique.** See "The street address is not unique" below. |
| `city` | text | 100% | City name. |
| `state` | text | 100% | Two-letter state code. |
| `zipcode` | text | 100% | 5-digit ZIP. Stored as text so leading zeros survive. |
| `county` | text | 100% | County name. |
| `county_fips` | text | 96.4% | 5-digit county FIPS code, useful for joining to census data. |
| `parcel_number` | text | 99.6% | County parcel number. The field that tells units in the same building apart. |
| `latitude` | number | 100% | Decimal degrees. |
| `longitude` | number | 100% | Decimal degrees. |
| `university` | text | 100% | Nearest campus, assigned from the coordinates. One of 11 values. |
| `miles_to_campus` | number | 100% | Straight-line miles to that campus's landmark. Ranges 0.2 to 15.1, median 3.4. |
| `list_date` | date | 82.6% | Date the home was listed for sale, in the listing that led to this sale. See "The three dates". |
| `contract_date` | date | 81.6% | Date the sale went under contract. |
| `sale_date` | date | all but 6 | Date the sale closed. |
| `sale_price` | integer | 100% | Sale price in US dollars. Contains some implausible values. |
| `home_type` | text | 100% | Property type as reported. Unreliable, see below. |
| `beds` | integer | 100% | Bedrooms. |
| `baths` | number | all but 14 | Bathrooms. Halves allowed, so 2.5 is a real value. |
| `living_area_sqft` | integer | 98.9% | Finished living area. A few rows are 0. |
| `lot_size_sqft` | integer | 96.4% | Lot size. |
| `year_built` | integer | all but 1 | Year built. Ranges 1900 to 2026. |
| `stories` | integer | 80.5% | Number of stories. |
| `has_basement` | 0/1 | 59.9% | 1 = yes, 0 = no, blank = not reported. |
| `has_garage` | 0/1 | 100% | 1 = yes, 0 = no. |
| `garage_spaces` | integer | 65.5% | Garage parking capacity. |
| `has_cooling` | 0/1 | 97.4% | 1 = yes, 0 = no, blank = not reported. |
| `has_heating` | 0/1 | 99.7% | 1 = yes, 0 = no, blank = not reported. |
| `has_fireplace` | 0/1 | 71.8% | 1 = yes, 0 = no, blank = not reported. |
| `architectural_style` | text | 62.0% | Free text. "Ranch" and "Traditional" are the most common. Not standardized. |
| `roof_type` | text | 60.2% | Free text. Not standardized. |
| `tax_annual_amount` | number | 98.3% | Most recent annual property tax, US dollars. |
| `tax_assessed_value` | integer | 97.1% | Most recent assessed value. **This is not the sale price** and the two often differ a lot. |
| `school_district` | text | 47.9% | High school district. Under half filled, and values are inconsistent (some names, some numbers). |

Missing values are empty in CSV and Excel, and `NULL` in SQLite, DuckDB and Parquet. Dates are
`YYYY-MM-DD` text in CSV and SQLite, and real dates in Excel, DuckDB and Parquet.

## The three dates, and how to get days on market

Every sale moves through three steps, and each has its own column:

| Column | The step | Typical gap |
|---|---|---|
| `list_date` | The home is listed for sale | |
| `contract_date` | A buyer's offer is accepted and the sale goes under contract | median 11 days after listing |
| `sale_date` | The sale closes and ownership changes hands | median 31 days after contract |

**Days on market** is the time from listing to contract:

```sql
-- SQLite
SELECT city,
       COUNT(*) AS sales,
       ROUND(AVG(julianday(contract_date) - julianday(list_date)), 1) AS avg_days_on_market
FROM home_sales
WHERE list_date IS NOT NULL AND contract_date IS NOT NULL
GROUP BY city
ORDER BY avg_days_on_market;
```

```python
# pandas
df["days_on_market"] = (pd.to_datetime(df["contract_date"]) - pd.to_datetime(df["list_date"])).dt.days
df.groupby("city")["days_on_market"].median()
```

`sale_date - list_date` is **not** days on market. It adds the month or so it takes to close
(median 50 days from listing to closing, against 11 to contract). Real estate sites count days on
market to the contract, so a site built on `sale_date - list_date` will disagree with all of them.

**How the dates handle common situations:**

- **A deal fell through and the home came back on the market.** The clock does not restart.
  `list_date` stays at the original listing, the way Zillow and most listing services count it.
  This applies to 2,021 rows.
- **The listing was withdrawn, then the home was listed again later.** That is a new listing,
  and `list_date` is the second one.
- **Listed and under contract the same day.** Days on market is 0, on 384 rows. This is common
  when a deal was arranged before the listing went public and the listing was entered for the
  record.
- **Under contract on the closing day.** Time to close is 0, on 68 rows.

**Why a date can be blank:**

| Blank | Rows | Why |
|---|---:|---|
| `list_date` | 5,195 | Sold with no listing on record: an off-market sale, or a new home sold by the builder |
| | 857 | The listing was withdrawn, or switched to a rental, before any contract, and the home sold later |
| | 122 | The listing had gone silent for more than a year before the contract |
| `contract_date` | 6,325 | No pending or contingent status was recorded for the sale |
| | 147 | The last recorded contract was more than a year before closing, so it was not this sale's |
| | 50 | The deal fell through: the listing was withdrawn more than 90 days before closing |
| all three | 6 | The source has no listing or sale history for the property at all |

Days on market can be computed on 28,042 rows (79.1%), the rows with both a list and a contract
date.

## Five things that will bite you

These are real characteristics of the data. They are left in on purpose, and a good analysis
says what it did about each one.

**1. Days on market needs both dates, a blank is not zero, and the blanks are not random.**

| City | No list date |
|---|---:|
| Pittsboro, NC | 38.0% |
| State College, PA | 31.8% |
| Carrboro, NC | 27.9% |
| Charlottesville, VA | 25.4% |
| Urbana, IL | 22.0% |
| ... | |
| West Lafayette, IN | 8.5% |
| Lafayette, IN | 5.0% |

Homes that sold without a listing are disproportionately new construction: 16% of them were
built the year of the sale or the year before, against 6% of listed homes. So a city's days on
market describes the homes that were listed, and in Pittsboro that is under two thirds of them.
Treating a blank as zero is worse: it makes thousands of homes look as if they sold instantly.

The upper tail is long as well. The median is 11 days, but 67 homes took more than a year to go
under contract, so a mean will be pulled well above the median.

**2. The street address is not unique.** 66 rows share a street address with another row, at
16 addresses, and the source recorded no unit number for any of them. 60 of those rows are
separate condo or apartment units in 13 State College buildings.

456 E Beaver Ave in State College is the clearest case: ten rows, all at that one address. They
are ten different apartments, one-bedroom units of 660 to 696 sq ft that sold for $210,000 to
$270,000 and two-bedroom units at $390,000 to $395,000. Their parcel numbers end 0505, 0506,
0603, 0609, 0610, 0708, 0803, 0807, 0908 and 0909, which is how the county tells them apart.

Two consequences:

- **Never deduplicate by address.** It deletes real homes and moves the city's median price.
  Use `listing_id` as the key. `parcel_number` is what distinguishes units.
- **A repeated address is not the building's unit count.** Those ten rows are the units that
  sold during the collection window, not the size of the building. The gaps in the parcel
  numbers say the building holds considerably more. A 100-unit tower with one sale in the
  window appears here exactly once.

The other six rows are three pairs, in Chapel Hill, Charlottesville and Gainesville. Each pair
is a home built in 2023 or 2024 with two different sales, about a year or more apart and at
different prices, under two parcel numbers. The source does not show whether a pair is one home
sold twice or two homes given the same address, so both rows are kept.

To find these addresses yourself:

```sql
SELECT address_street, city, COUNT(*) AS sales_at_address
FROM home_sales
GROUP BY address_street, city, state, zipcode
HAVING COUNT(*) > 1
ORDER BY sales_at_address DESC;
```

**3. Some prices are impossible.** 40 sales are under $10,000, four are under $1,000 including
one at $0, and 31 are over $5,000,000, up to $81,510,000. The median is $410,000 and the 99th
percentile is $1.9 million. Decide on a rule, state it, and apply it consistently. Averages
without a rule are meaningless here.

**4. `home_type` is wrong more often than it looks.** 35,263 rows say `SINGLE_FAMILY`,
including the State College condo units, which are plainly not single family homes. 177 say
`HOME_TYPE_UNKNOWN` and 2 say `CONDO`. Do not build an analysis that depends on this column.

**5. A few values are impossible on their face.** `living_area_sqft` is 0 on 127 rows, so price
per square foot divides by zero unless you filter. Lot sizes run to 1,435,737,600 sq ft, about
33,000 acres for a house in a college town: 274 lots are over 10 acres and 20 are over 100
acres, against a median lot of 10,018 sq ft. One home reports 60 bathrooms, and one annual tax
bill is exactly $1,000,000,000.

## Campus areas

Every row carries the nearest campus in `university` and the distance in `miles_to_campus`, so
you can compare college towns without grouping cities by hand:

```sql
SELECT university, COUNT(*) AS sales, ROUND(AVG(sale_price)) AS avg_price
FROM home_sales
WHERE sale_price >= 1000
GROUP BY university
ORDER BY sales DESC;
```

**How it is assigned.** Each property's own latitude and longitude are compared to one landmark
per campus (Foellinger Auditorium on the Illinois Main Quad, the Diag, Bascom Hill, Purdue's
Engineering Fountain, Century Tower, the Old Well, the Old Capitol, Shields Library on the UC
Davis Quad, and each university's reference point for Georgia, Virginia and Penn State), and the
nearest wins. The city label plays no part, which matters because a few rows in the source carry
a city or ZIP that does not match their coordinates.

`miles_to_campus` is straight-line distance, not driving distance, and every row falls within
15.1 miles of its campus.

### Which cities belong to which campus

Every city below appears in the dataset and the counts sum to all 35,442 rows.

| University | Cities (rows) | Total rows |
|---|---|---:|
| Purdue University | Lafayette (3,057), West Lafayette (1,559) | 4,616 |
| The Pennsylvania State University | State College (1,351) | 1,351 |
| The University of Iowa | Iowa City (1,909) | 1,909 |
| The University of North Carolina at Chapel Hill | Chapel Hill (2,716), Carrboro (208), Pittsboro (92) | 3,016 |
| University of California, Davis | Davis (941) | 941 |
| University of Florida | Gainesville (5,477), Newberry (152) | 5,629 |
| University of Georgia | Athens (2,814) | 2,814 |
| University of Illinois Urbana-Champaign | Champaign (2,286), Urbana (1,131), Savoy (247) | 3,664 |
| University of Michigan | Ann Arbor (3,021) | 3,021 |
| University of Virginia | Charlottesville (2,775) | 2,775 |
| University of Wisconsin-Madison | Madison (5,061), Middleton (645) | 5,706 |

## Where the data came from

Collected in March 2026 from public property listings across 14 US college towns. Each row's
attributes are property characteristics that also appear in county assessor and recorder records.
The three dates come from each property's recorded listing and sale history.

Removed before release: agent and broker names, phone numbers and emails; listing photos and
descriptions; valuation estimates and platform-specific metrics; and all platform identifiers.
Rows for homes currently being marketed and rows with withheld addresses were also removed, so
every row is a completed sale. Where the source listed the same property twice, or recorded
one sale under two parcel numbers, one row was kept. Cities with fewer than 90 sales were dropped as well, which removed 255 rows across 57
places.

**Values are as reported by the collection source, not verified against county records.** An
address, parcel number or assessed value may differ from the county's own file. Treat this
dataset as a copy of what one source said in March 2026, which is a useful thing to keep in mind
whenever you are asked where a number came from.

Two cleaning steps changed values: text placeholders like `NA` and `unknown` were converted to
missing (15 values), and inconsistent city spellings were made consistent (`URBANA` to `Urbana`
and similar, 22 rows). Everything else is as collected. Full details are in the build notes.

## Citation

> College-town home sales dataset, version 1.0 (2026). University of Illinois-Deloitte
> Foundation Center for Business Emerging Technologies. Data collected March 2026.
