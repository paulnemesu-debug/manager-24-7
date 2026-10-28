# Offline Food.com catalogue

The optional reference library is derived from version 2 of
[Food.com Recipes and Reviews](https://www.kaggle.com/datasets/irkaal/foodcom-recipes-and-reviews).
The uploader declares CC0. The source contains 522,517 recipes. It is kept outside
the application repository; reviews, pictures, author data and descriptions are
excluded from the downloadable library.

Run `build-foodcom-catalogue.py --source <recipes.parquet> --output <new-directory>`
with Python and PyArrow. `--python-packages <directory>` can point to an isolated
PyArrow installation. The builder checks the audited source SHA-256 and refuses
to overwrite an existing database. It produces a checksummed manifest, the native
SQLite download and 64 compressed JSONL parts for browser storage.

The SQLite database is about 366 MB, with compressed per-recipe payloads and an
FTS5 title/category index. Its gzip download is about 314 MB. The browser imports
the same recipes from approximately 153 MB of JSONL downloads into IndexedDB;
each completed part and its resume checkpoint commit in one transaction. Browser
installation and removal share an exclusive Web Lock across tabs.

Native downloads use the public `catalogue-foodcom-v2` GitHub release. Browser
downloads use the repository's immutable `catalogue-web` commit through
`raw.githubusercontent.com` (which supplies `Access-Control-Allow-Origin: *`),
because GitHub release redirects do not supply browser CORS headers. The complete catalogue is
optional and never bundled into the application JavaScript or APK.

## Source limitations and import behavior

Ingredient names and quantities are separate arrays. In 407,536 source rows their
lengths differ. Quantity units and serving weights are absent. Do not zip the
arrays, invent gram amounts, or distribute recipe nutrition among ingredients.
Source nutrient order is kcal, fat g, saturates g, cholesterol mg, sodium mg,
carbohydrates g, fibre g, sugars g, protein g, per source serving.

Copying a recipe preserves the original arrays, instructions, nutrition basis and
source links in reference notes. Ingredient quantities and prices start at zero;
ingredient nutrition stays unknown. The editor requires positive ingredient
quantities and purchase prices, compatible units and explicit source review before
save, duplicate or export. Until review, financial status stays incomplete.
The acknowledgement persists in local draft metadata and a readable marker in
the existing cloud source-reference field; it does not confirm source nutrition.

Removing the optional catalogue affects only its dedicated filesystem directory
or IndexedDB database. Recipes already copied into the user's library remain.
