# dawatkhi/api-version-platform

The API Version Platform (React UI + PHP backend) as a Composer package. Install it into any PHP project and launch it with one command. No Node.js, Apache, or route wiring is needed.

> Local development tool. It runs on PHP's built-in server, which is not meant for production. It binds to `127.0.0.1` by default.

## Usage

```bash
composer require --dev dawatkhi/api-version-platform
vendor/bin/avp-serve init      # writes avp.config.php with a random JWT secret
# edit the db section of avp.config.php, and add avp.config.php to .gitignore
vendor/bin/avp-serve check     # validates config + database connection
vendor/bin/avp-serve           # http://127.0.0.1:8080
vendor/bin/avp-serve --port=9000 --host=0.0.0.0 --config=path/to/avp.config.php
```

The database must already contain the platform schema (same MySQL schema as the hosted `php_backend`).

### Configuration

Values are resolved from lowest to highest priority:

1. Defaults in `src/Config.php`
2. `avp.config.php` in the project root, or the file given with `--config` (see `config/avp.config.example.php`)
3. Environment variables: `AVP_DB_HOST`, `AVP_DB_PORT`, `AVP_DB_NAME`, `AVP_DB_USER`, `AVP_DB_PASS`, `AVP_DB_CHARSET`, `AVP_JWT_SECRET`, `AVP_JWT_EXPIRATION`, `AVP_HOST`, `AVP_PORT`

## How it works

```
bin/avp-serve         CLI: init / check / serve -> php -S host:port -t resources/ui src/router.php
src/router.php        /backend/*.php -> backend script, static UI files -> served natively, else -> index.html
src/Config.php        config resolution (file + env)
src/Server.php        process launcher + `init`
resources/ui/         pre-built client (generated, committed)
backend/              copy of php_backend (generated, committed)
backend-overrides/    files replacing their php_backend counterparts; config.php reads avp config instead of hardcoded credentials
scripts/sync.php      copies a Vite build / php_backend into the package
```

The built UI calls its API at `./backend/...` relative to the page it's served from (`client/src/base.js` in the web project). Serving the UI at `/` and the backend at `/backend/` therefore needs no client changes.

## Updating the package

`resources/ui/` and `backend/` are copies of the web project's build output. Don't edit them by hand.

The web deployment and this package use the same Vite build. When the frontend changes:

1. In the web project run `npm run build` once. Upload `dist/` to the web server as usual.
2. Copy the same `dist/` into this package:
   ```bash
   php scripts/sync.php --ui=../web-project/client/dist
   ```
   You can also replace the contents of `resources/ui/` by hand. The script is safer: it clears out old hashed files and rejects a build that uses absolute asset paths.
3. Commit, tag a new version (`git tag v0.2.0 && git push --tags`), and consumers run `composer update`.

When the PHP backend changes, sync it the same way. You can pass both options in one call:

```bash
php scripts/sync.php --backend=../web-project/php_backend
php scripts/lint.php   # php -l on every package PHP file
```

The backend sync never copies `config.php` (it holds credentials) or `uploads/`, and applies `backend-overrides/config.php` on top. If the web `config.php` gains new behaviour, port it to the override by hand.

The same build only works for both while `VITE_API_BASE` is empty when you build. A build with a hardcoded API URL will call that server instead of the bundled backend.

### Publishing

This folder is the repository root, so `composer.json` is where Packagist expects it.

- Public: push to GitHub and submit the repo URL on packagist.org. Git tags become versions.
- Private: consuming projects add the repo as a VCS repository:
  ```json
  "repositories": [{ "type": "vcs", "url": "git@github.com:your-org/api-version-platform.git" }]
  ```
  To test locally before pushing, use `{ "type": "path", "url": "../api-version-platform" }` instead.

## Known limitations

- Avatar uploads are written to `backend/uploads/` inside `vendor/`, so `composer update` wipes them. Making the upload directory configurable needs a small change in the web project's `php_backend/includes/helpers.php`, followed by a backend sync.
- There is no schema installer yet. The database has to be provisioned separately.
