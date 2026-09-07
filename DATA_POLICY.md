# Data and attribution policy

PC Build Planner is an independent third-party project. It is not affiliated with, authorized by, endorsed by, or operated by CoolPC / 原價屋.

## Purpose

The site reorganizes publicly accessible PC-parts pricing/catalog information into an independent interface for search, filtering, build planning, and conservative compatibility checks.

## Public data

The public deployment intentionally keeps only the fields needed by the browser UI, such as category, subcategory, brand, product name, price, normalized specifications, and an opaque internal public identifier.

The public repository does not intentionally publish the private scraper's raw source text, original option values, CSS source classes, CSV exports, or historical source snapshots.

## Accuracy and freshness

Prices, availability, product descriptions, specifications, and compatibility results may be incomplete, delayed, or incorrect. They are provided for convenience only. Users should verify current information with the original retailer and the product manufacturer before purchasing.

## Source behavior

The upstream collection process is designed to be low-impact. A refresh retrieves the publicly accessible estimator page and parses the returned catalog locally rather than issuing a high-concurrency request for each individual product.

The project does not intend to bypass authentication, CAPTCHA, rate limits, or other access controls. If the upstream site restricts access or changes its public data format, the collector should fail conservatively rather than bypass those restrictions.

## Branding

CoolPC / 原價屋 names may be used descriptively to identify the source of pricing/catalog information. Their logos and branding are not used to present PC Build Planner as an official CoolPC service.
