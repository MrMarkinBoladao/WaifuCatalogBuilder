# Waifu Catalog Builder

![Status: first version](https://img.shields.io/badge/status-first%20version-blue)

A build creator for Waifu Catalog, based on the [Main Sourcebook (Current/unstable ver.)](https://docs.google.com/document/d/1ILzH_MYYTsS40Dx4YnnqbGiFaHiqVRZD-yJBEz4CnEg/edit). You pick options, the app keeps the balance, and it exports a plain text of the build that you can paste into a conversation with an LLM, which turns it into a roleplay prompt.

The app is a single HTML page. It runs in the browser, works offline once it is open, and has no server and no tracking. The interface is available in English and in Portuguese (button at the top right).

**Use it online:** <https://mrmarkinboladao.github.io/WaifuCatalogBuilder/> (published by the `Site` workflow with GitHub Pages).

## Source of truth

The only reference for this project is the Main Sourcebook linked above. Every option, rule and mechanic comes from it. The Waifu Catalog Interactive is not used as a reference.

The app does not contain the text of the document. It has option names, numbers and short summaries written by the author of this project, in Portuguese.

## What it does

- **Browse and buy.** Tabs for each category (Intensity, Origin, Heritage, Bindings, Lures, Other Controls, Sanctuaries & Strongholds, Talents, Defenses, Other Perks, Company Services), a search box, and a note on what is missing when an option has a requirement you do not meet yet.
- **Always know the balance.** The balance is at the top of the page. Intensity, budget, loan, free gifts, discounts and the cost of each companion are calculated for you, with a ledger that lists every line and every subtotal. Going below zero is flagged as debt.
- **Undo and redo** for every change, and a draft that is kept in the browser while you work.
- **Companions** are typed in (name, work and tier), because the document keeps its character list in a separate spreadsheet.
- **Export and import.** The *Text* tab gives you the build as plain text (format `wcb/1`). Importing the same text brings the build back exactly as it was.
- **Saved versions and a full backup.** Save versions of a build in the browser, download any of them as a `.txt`, load them back, and download one `.json` backup with everything. Loading a backup adds its versions to yours and never deletes anything.
- **Honest warnings.** Any value the data cannot confirm in the document, any rule the app does not calculate yet, and any rule your build breaks is shown in the app and written into the exported text, so the LLM and you both see it.

## Using the exported text

1. Build the character here and open the *Text* tab.
2. Copy the text.
3. Paste it into your request to the LLM that follows the Waifu Catalog protocol. In the author's repository that protocol lives in `waifu-catalog-oficial/`, and the request looks like this: *I want to create a prompt with Waifu Catalog Oficial. My build is this: {{BUILD TEXT}}*

The text format is described in [`docs/formato-da-build.md`](docs/formato-da-build.md). The documents in `docs/` are written in Portuguese.

## Running it yourself

You need Node.js 22 or newer. There is nothing to install.

```sh
npm test            # runs all tests (engine, text format, data checker, page, document watcher)
npm run montar      # builds the whole app into dist/index.html
```

Open `dist/index.html` in a browser. The file works without a network connection.

## Data

The options live in [`dados/`](dados/), one JSON file per category, described in [`docs/esquema-de-dados.md`](docs/esquema-de-dados.md). The data checker (`npm run validar`) fails if a file breaks the schema, if an option points to something that does not exist, or if a name does not match the reference the data was checked against.

Values that could not be confirmed in the text of the document are marked and listed in [`docs/pendencias-de-dados.md`](docs/pendencias-de-dados.md). Rules the schema cannot describe are listed in [`docs/regras-especiais.md`](docs/regras-especiais.md), with their state: calculated or not yet calculated.

## Keeping up with the document

A weekly workflow (`Vigia`) compares the structure of the Main Sourcebook with the last version the data was checked against, and opens an issue when it changes. See [`docs/vigia/LEIA-ME.md`](docs/vigia/LEIA-ME.md).

## Related projects

- [WaifuCatalogBuildFix](https://github.com/MrMarkinBoladao/WaifuCatalogBuildFix): a build checker for the Waifu Catalog Interactive, by the same author. It is a separate project and is not a reference for this one.

## Contributing

The most useful help is feedback. If you find a wrong number, a rule that is easy to get wrong, or a mechanic you would like to see handled better, open an [issue](https://github.com/MrMarkinBoladao/WaifuCatalogBuilder/issues).

## Credits and disclaimer

This is a fan-made tool and is not officially affiliated with the Waifu Catalog. The rules, options and mechanics belong to the Waifu Catalog and its authors.

## License

To be defined.
