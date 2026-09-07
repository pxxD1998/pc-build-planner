# PC Build Planner

A lightweight browser-based PC parts planner for Taiwan.

Live site:

```text
https://pxxd1998.github.io/pc-build-planner/
```

This public repository contains the deployable web application and its GitHub Actions scheduler/orchestrator. Development tooling, parsers, tests, audit data, raw source evidence, CSV exports, and source snapshots remain in the private source repository.

## Current status

Public Beta / early usable product.

Current capabilities include:

- desktop and mobile browsing,
- all 30 source catalog categories,
- search, price/brand/subcategory filtering and sorting,
- persistent current build with total/copy/JSON export,
- structured hardware spec chips,
- conservative compatibility checks,
- GPU physical length vs CASE GPU-clearance checks,
- mobile current-build bottom sheet for long catalogs,
- automatic cloud refresh/build/publish.

## Data refresh

The site does not require the owner's home PC to remain online.

Normal cloud flow:

```text
scheduled GitHub Actions
-> read private source pipeline
-> run tests
-> periodically fetch one fresh retailer estimator page
-> parse locally
-> rebuild sanitized public data/site only when needed
-> GitHub Pages redeploys public main
```

Upstream catalog data is currently polled every six hours, not updated instantaneously.

## Data source

Product and pricing information is derived from publicly accessible retailer estimate data and is provided for convenience only. This project is independent and is not affiliated with, endorsed by, authorized by, or operated by CoolPC / 原價屋.

Prices, availability, specifications, and compatibility information may be incomplete, delayed, or outdated. Always verify current information with the original retailer or manufacturer before purchasing.

## Public data boundary

The public deployment intentionally uses a minimized payload needed by the browser UI. Raw source text, original option values, source CSS classes, CSV exports, history snapshots, private parser source, tests, and audit notes are not intended to be published here.
