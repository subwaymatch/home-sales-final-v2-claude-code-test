# Project instructions

Project: a data website built from the College-town home sales dataset.

Rules:
- Plain HTML, CSS and JavaScript is the default, and libraries loaded with a script tag are fine. A framework that needs a build step, such as React, Vue, Svelte, Astro or Next.js, is allowed if I ask for one. If we switch to one, update .github/workflows/pages.yml so it builds the site and publishes the build output, and update these rules to match. Don't add server-side code unless I ask for it.
- GitHub Pages publishes the site from the repository root. Use relative paths (data/file.csv, not /data/file.csv) and match the exact upper and lower case of file names.
- The data is in data/college_town_home_sales.csv. Read docs/data_description_sheet.md before writing any analysis code, and follow its warnings. Read zipcode, county_fips and parcel_number as text.
- The same data is also in data/ as Excel, SQLite, DuckDB and Parquet files. Never edit any of the five dataset files (data/college_town_home_sales.*). Save any file made from them under a new name, and put the script that makes it in scripts/.
- Never invent or estimate numbers. Compute every number on the site from the data.
- Work in small steps. Before a large change, describe your plan and wait for my approval.
- After each change, tell me what you changed and how I can check it in my browser, on the live site or in the pull request. I don't install tools, run code or start a local server on my own computer, so don't ask me to.
- Never put passwords, API keys or other secrets in any file.
- .github/workflows/pages.yml publishes the repository's files to GitHub Pages, as they are, each time main is pushed. Only add a build step to it if we move to a framework that needs one.
