# mohammad/api-version-platform

Version your API documentation locally. Write your API in a README using the bundled Markdown template; the platform turns it into OpenAPI 3.0, keeps every version in a local SQLite database, and gives you the full API Version Platform web UI (version history, diffs, OpenAPI viewer and an API tester) on `localhost`.

No Node.js, MySQL, accounts or web-server setup is needed.

> Local developer tool. It runs on PHP's built-in server, has no authentication, and binds to `127.0.0.1` by default. Do not expose it on a public network.

## Requirements

- PHP 8.1+
- `pdo_sqlite` extension (enabled in most PHP builds)
- `openssl` extension, only to test HTTPS APIs from the Test APIs tab

## Quick start

```bash
composer require --dev mohammad/api-version-platform

vendor/bin/avp init                      # writes avp.config.php and creates .avp/
vendor/bin/avp template --output=README.md   # skip if your README already follows the template
vendor/bin/avp version create v1.0.0 --note="First version"
vendor/bin/avp serve                     # http://127.0.0.1:8080
```

Add the local state to your project's `.gitignore`:

```gitignore
/.avp/
```

## CLI

```text
avp init [--force]
avp template [--output=PATH] [--force]
avp status [--readme=PATH] [--json]
avp version create <label> [--note=TEXT] [--readme=PATH] [--allow-unchanged]
avp version list [--json]
avp version show <label> [--format=markdown|openapi|json]
avp serve [--host=127.0.0.1] [--port=8080]
```

Every command accepts `--config=PATH`. `avp-serve` is kept as an alias of `avp`.

`avp status` works like `git status` for the configured README:

| State | Meaning | Exit code |
| --- | --- | --- |
| `uninitialized` | README is valid but no version was created from it yet | 0 |
| `clean` | README matches the last version created from it | 0 |
| `modified` | README changed since that version | 2 |
| `missing` / `invalid` | README cannot be read, or has no endpoints | 1 |

Line-ending (CRLF/LF) and UTF-8 BOM differences do not count as changes.

## Web UI

`avp serve` opens the same interface as the hosted platform, running as a single local project:

- **README banner**: when the configured README changes, the UI shows what changed (endpoints added, removed or changed) and saves it as the next version in one click.
- **Versions**: upload or paste README Markdown or OpenAPI JSON, review it, and save it as a version; view, edit, compare and delete versions.
- **Test APIs**: send requests to your API using environments (base URLs) you define. Requests are sent by the local PHP server, so CORS does not apply.
- **History**: requests sent from the tester, stored locally.

Accounts, collaborators and share links belong to the hosted platform and are not part of the package.

Versions created from the README (CLI or banner) store the exact Markdown source and move the README baseline. Versions imported or edited in the UI store OpenAPI only and do not change `avp status`.

## Configuration

`avp.config.php` (created by `avp init`; see `config/avp.config.example.php`):

```php
return [
    'paths' => [
        'readme' => 'README.md',              // the working copy
        'storage' => '.avp/storage.sqlite',
    ],
    'server' => [
        'host' => '127.0.0.1',
        'port' => 8080,
    ],
];
```

Relative paths are resolved from the config file's folder. Environment variables override the file: `AVP_README_PATH`, `AVP_STORAGE_PATH`, `AVP_HOST`, `AVP_PORT`.

## How it works

```
bin/avp               CLI: init / template / status / version / serve
src/router.php        /api/* -> local API, static UI files, everything else -> index.html
src/LocalApi.php      the web client's API routes for one local user and project
src/VersionService.php  README status, version create/import/edit/delete
src/Storage.php       SQLite schema and migrations
src/MarkdownOpenApiParser.php  README Markdown -> OpenAPI 3.0.3
resources/ui/         pre-built web client (generated, committed)
resources/templates/  README template served by `avp template` and the UI
client/               React source shared with the hosted web app (not in Composer archives)
```

## Updating the bundled UI (maintainers)

The UI in `resources/ui/` is the web app's React build in local mode. Do not edit it by hand. After changing the frontend in `client/`:

```bash
cd client
npm install
npm run build:package          # builds into client/dist-package with VITE_API_BASE=./api
cd ..
php scripts/sync.php --ui=client/dist-package
cp client/src/templates/API_README_TEMPLATE.md resources/templates/api-readme.md   # if the template changed
php scripts/lint.php
```

`npm run build` (the hosted web build) is unaffected. Then commit, tag a new version (`git tag v0.2.0 && git push --tags`), and consumers run `composer update`.

## License

MIT
