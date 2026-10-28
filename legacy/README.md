# Archived multi-user implementation

This directory preserves the removed hosted-service code while the local-only package migration is reviewed. It is excluded from Composer distribution through `.gitattributes` and is not loaded by the active application.

- `multi-user-backend/` contains the former JWT/MySQL/PHP backend, except for the Markdown parser that now lives in `src/MarkdownOpenApiParser.php`.
- `../client/` is the shared React source of the hosted web app. The package ships its local-mode build (`npm run build:package`), so no separate React copy is archived.

Delete this archive only after the local package has been released and verified in a fresh consumer project.
