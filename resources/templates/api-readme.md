<!--
=====================================================================
HOW TO USE THIS TEMPLATE  (everything inside an HTML comment, like this one,
is ignored by the parser, so you can leave these instructions in or
delete them - the result is the same)
=====================================================================
1. Copy this file into your project as API.md (or README.md) and
   replace "Example Service" and every example value with your own.
2. Keep the structure: one "# Title", a "## Conventions" section, then
   one "## Section" per module of your API.
3. Write each section heading as   Name — `path/prefix/`   (an em dash
   followed by the URL prefix in backticks). Endpoints inside the
   section are resolved against that prefix.
4. Describe endpoints with a table (Method | Endpoint | Permission |
   Description) or with a heading such as   ### POST `path/file.php`
   followed by "Request:" and "Response `data`:" JSON blocks.
5. Put endpoint paths, query examples, permission codes and status codes
   in `backticks`. Path placeholders use braces, e.g.
   `fetch/getAccount/{account_id}`; each placeholder becomes a required
   path parameter in the tester.
6. Add notes as plain paragraphs directly UNDER a table; they become
   part of the endpoint description in the generated OpenAPI.
7. Upload the file as a new project version. Read the parser warnings
   it shows; each one points at a line that needs a closer look.
8. Set authentication for every endpoint with `Auth: true` or
   `Auth: false` in an endpoint detail, a table Auth column, or its
   description. `true` requires a bearer token; `false` is public. The
   flag is retained in OpenAPI and can filter the test list.
9. Select or add an environment on the Test APIs page; it only needs a base URL.
   Environments are saved in the current user's browser. The tester finds the
   login endpoint (a public `Auth: false` login call) and the token in its
   documented response, so "Sign in" works without setup. Login settings in
   the Sign in panel can override them.
10. Use the PDF download for a printable copy. Edit the Markdown template
    when documenting an API.

Rules of thumb
- Do not put real secrets, tokens or passwords in examples.
- For credential or other constrained body fields, add a `//` comment
  after the example value to describe its requirements. Comments are
  attached to that field in the generated OpenAPI schema. For example,
  `// valid email format` sets the email format, and
  `// minimum 8 characters` sets the minimum string length. Comments are
  documentation only; use fake example values, never real credentials.
- Keep one endpoint per table row (use "POST/DELETE" in the Method
  column when one URL accepts several methods).
- Everything is optional except the endpoint paths: anything you leave
  out is simply left out of the OpenAPI document.
-->

# Example Service API

REST API for the fictional Example Service: customers, their documents and orders, plus a few reference lists. Replace this paragraph with one or two sentences about your own API; it becomes the description of the generated OpenAPI document.

<!--
TITLE AND INTRO
- The first "# Heading" is the API title.
- The first paragraph under it is the API description. Later
  paragraphs directly under the title are not used.
-->

## Conventions

<!--
CONVENTIONS apply to the whole API and are written once, here.
The parser reads these conventions from this section:
  a) the response envelope   (a JSON block with "statusCode" and "data")
  b) the paginated list shape (a JSON block with "items" and "pagination")
  d) API server URLs (`servers`) as documentation only; the tester uses the
     base URL of the active environment selected on the Test APIs page
  c) which endpoints are public (the sentence "Every endpoint except `x`
     requires ...") and the query parameters every list accepts
     (a paragraph starting with "Accepts `?page=` ...")
Anything else you write here (CORS, dates, ids...) is free text for your
readers; it is not turned into endpoints.
-->

**Auth.** Every endpoint except `auth/login.php` and `public/status.php` requires `Authorization: Bearer <jwt>`. The token is issued by `auth/login.php`. Most endpoints also check a permission code such as `customers:view`, written `<resource>:<action>` where the action is one of `view`, `add`, `edit`, `delete`.


**Response envelope.** Every response, success or error, has this shape:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {},
  "timestamp": "2026-01-01T00:00:00Z"
}
```

**Paginated list envelope.** List endpoints put their rows in `data` like this:

```json
{
  "items": [],
  "pagination": { "page": 1, "page_size": 20, "total": 42, "total_pages": 3 }
}
```

Accepts `?page=` (default 1), `?page_size=` (default 20, max 100), and usually `?search=`, `?sort=`, `?order=asc|desc`.

**Errors.** Non-2xx responses use the same envelope, with `data` usually `null` and `message` describing the problem. Common codes: `400` invalid input, `401` missing or expired token, `403` no permission, `404` not found, `409` conflict (duplicate or in use), `429` rate limited, `500` server error.

**Dates.** Dates are strict `YYYY-MM-DD`; timestamps are ISO 8601 in UTC.

---

## Authentication — `auth/`

<!--
SECTIONS
- "## Name — `prefix/`" starts a section. The prefix is prepended to
  every relative endpoint in it, so `login.php` here means /auth/login.php.
- An endpoint that already starts with the prefix (as below) or with "/"
  is used as written.
- A heading can itself be an endpoint: "### POST `auth/login.php`". Put
  prose, "Request:" / "Response `data`:" JSON blocks and an "Errors:"
  line directly under it.
- Mark every endpoint explicitly with `Auth: true` or `Auth: false`,
  either in a table's Auth column or in the endpoint heading/details.
  `No token required.` and the API-wide convention remain supported for
  older documents.
- The tester uses the base URL of the active browser-local environment.
- "Response `data`:" documents only the `data` part of the envelope; the
  envelope from Conventions is wrapped around it automatically. Add a
  status code like "Success `201`:" when it is not 200.
-->

### POST `auth/login.php`
Auth: false
No token required (this is how you get one).

Request:
```json
{
  "user_name": "user@example.com", // valid email format
  "login_password": "example-pass" // minimum 8 characters
}
```

Response `data`:
```json
{
  "token": "<jwt>",
  "expires_in": 86400,
  "user_id": 1,
  "full_name": "Jane Doe",
  "role_name": "Manager"
}
```
Errors: `401` invalid credentials, `429` too many failed attempts.

**Sessions.** Each login creates its own session, so a user can stay signed in on several devices.

### GET `auth/me.php`
Auth: true
Bearer required. Returns the caller's own profile and permissions.

---

## Customers — `customers/`

<!--
ENDPOINT TABLES
Columns (header names are matched case-insensitively, order is free):
  Method       GET, POST, PUT, PATCH, DELETE. Use "POST/DELETE" or
               "POST or DELETE" when one URL accepts several methods
               (one operation is created per method).
  Endpoint     The path in backticks, relative to the section prefix.
               - `fetch/getCustomer.php?customer_id=1` : the query
                 template makes customer_id a REQUIRED query parameter
                 (the example value gives its type: 1 -> integer,
                 YYYY-MM-DD -> date, a|b -> enum).
               - `remove/removeCustomer.php` — `{customer_id}` : a
                 backticked {...} after the path is the JSON body.
  Permission   Permission codes in backticks. `customers:add`/`edit`
               expands to customers:add and customers:edit. Write
               Bearer for "token only, no permission", or
               Bearer + `customers:view`. Use `customers:view` or
               `customers:view_all` when either permission is enough.
               The column may also be
               called Auth.
  Auth         Use a separate Auth column for each endpoint with the
               explicit value `true` or `false`; it may be combined
               with Permission.
  Description  Free text (first sentence = summary), plus facts the
               parser understands:
               - `?search=` (matches name)  : optional query param;
                 `?status=a|b` makes it an enum
               - Paginated ...              : starting the text with
                 the word Paginated adds the page/page_size params
                 from Conventions
               - **requires** `customer_id` : required query param
               - `{name, email, phone?}`    : JSON body; a field is
                 required unless it ends with "?"
               - `{id: integer, active: boolean, tags: string[]}`:
                 typed shorthand; use this when a field has no example
                 value. Empty JSON arrays cannot reveal their item type.
               - `409` duplicate email      : error response with that
                 status and text
               - `Headers: `Idempotency-Key` (required)` : a documented
                 request header parameter; prose such as "Requests must
                 include the `Idempotency-Key` header" is also parsed
               - Also reachable at `path` (alias) : documents a second
                 URL for the same operation
Use \| for a literal pipe character inside a table cell.

NESTED JSON, RESPONSE DOWNLOADS AND REFERENCE TABLES
Nested objects and arrays (including arrays of objects) are inferred
recursively from labelled JSON examples. For example:

  `account.php` request:
  ```json
  { "address": { "city": "Lima", "postal_code": "15001" } }
  ```

  `account.php` response:
  ```json
  { "accounts": [{ "account_id": 1, "address": { "city": "Lima" } }] }
  ```

For non-JSON success responses, add a `Response:` declaration to the
endpoint description or its note directly under the endpoint table:

  Response: text/csv
  Response: application/pdf (binary)

CSV/text responses remain readable and can be downloaded from the tester.
Binary responses are kept as bytes and can be downloaded without UTF-8
corruption. A server's Content-Type and Content-Disposition headers are
also respected; a download filename is taken from Content-Disposition
when present. Responses larger than 5 MB are truncated and cannot be
downloaded as complete files.

Reference-table operation cells may be left blank when the entity does
not support that action; an empty Remove cell does not create an endpoint.
-->

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | `fetch/getCustomers.php` | `customers:view` | true | Paginated list of customers. `?search=` matches name or email, `?status=active\|inactive` filters by status |
| GET | `fetch/getCustomer.php?customer_id=1` | `customers:view` | true | One customer by id. `404` customer not found. Also reachable at `fetch/getCustomerById.php?customer_id=1` (alias) |
| POST | `modify/insertUpdateCustomer.php` | `customers:add`/`edit` | true | Create or update a customer (`customer_id` present means update): `{customer_name, email, phone?, status?}`. `409` duplicate email |
| POST/DELETE | `remove/removeCustomer.php` — `{customer_id}` | `customers:delete` | true | Soft-delete a customer |
| GET | `fetch/getCustomerOrders.php` | Bearer + `orders:view` | true | Orders of one customer; **requires** `customer_id` |
| POST | `modify/changeCustomerStatus.php` | `customers:edit` | true | Activate or deactivate a customer |

Customers are never hard-deleted: removing one sets `is_deleted` and hides it from every list. Email addresses are unique per account, compared case-insensitively.

Remove errors: `409` customer still has open orders.

`changeCustomerStatus.php` request:
```json
{ "customer_id": 7, "status": "inactive" }
```

<!--
NOTES UNDER A TABLE
Plain paragraphs placed directly under a table (before the next heading,
table or code block) become part of the description of the endpoint
they are about, in the generated OpenAPI:
  - A note that mentions an endpoint file in backticks
    (`insertUpdateCustomer.php`) goes to that endpoint only.
  - A note that shares a key word with the file name of only some
    endpoints (e.g. "Uploading ..." and uploadDocument.php) goes to those.
  - Any other note is attached to every endpoint of the table.
Lines that start with "Errors:", "Remove errors:", "Query params:" or
"Base path:" are read as structured facts and are not copied into the
description.

LABELLED JSON EXAMPLES
A JSON code block is a request or response example when the paragraph
right before it is a label ending with ":"
  `file.php` request:      -> request body of file.php
  `file.php` response:     -> success response of file.php
  Request: / Response `data`: / Success `201`:   (inside a heading-style
    endpoint, these bind to that endpoint)
An unlabelled block, or one that names no known file, is reported as a
warning instead of being guessed.
-->

### Customer documents — `customers/documents/`

<!--
NESTED SECTIONS
A deeper heading nests under the previous one and may use its own
prefix. Its tag/breadcrumb in the OpenAPI is built from the headings.

MULTIPART UPLOADS
Write `multipart/form-data` in the description, then the field names in
backticks. A trailing "?" marks a field optional. Put the words "file
field" right before the backticked name of the file field; that field
becomes type string, format binary.
-->

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | `fetch/getDocuments.php?customer_id=1` | `customers:view` | true | List documents of a customer, newest first |
| POST | `modify/uploadDocument.php` | `customers:edit` | true | `multipart/form-data`: `customer_id`, `document_type?`, file field `file` |
| POST | `remove/removeDocument.php` — `{document_id}` | `customers:edit` | true | Soft-delete a document |

Accepted file types: PDF, PNG and JPEG, sniffed from the real file bytes. Max 10MB. Uploading logs a `document_added` history entry. **Note:** files live on local disk and are wiped on every deploy until object storage is wired in.

## Orders — `orders/`

<!--
HEADING-STYLE ENDPOINTS WITH DETAILS
A table row can be detailed further by a heading naming the same method
and file, one level below the table's section:
  #### GET `getOrders.php`
Everything under that heading (prose, "Query params:", JSON examples)
is merged into the table row instead of creating a new endpoint.

Query params: a paragraph starting with "Query params:" lists the
parameters. "(required)" makes one required; "(default 1)" sets a
default; "(`a`, `b`; default `a`)" makes an enum.
-->

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | `fetch/getOrders.php` | `orders:view` | true | Paginated list of orders |
| POST | `modify/createOrder.php` | `orders:add` | true | Place a new order |

#### GET `getOrders.php`
Query params: `customer_id` (required), `status` (`open`, `shipped`, `cancelled`; default `open`), `sort` (`created_at`, `total`; default `created_at`), `order` (`asc`, `desc`; default `asc`).

#### POST `createOrder.php`
Returns the stored order. The total is always recalculated on the server.

Request:
```json
{ "customer_id": 1, "items": [ { "sku": "A-100", "quantity": 2 } ], "note": "Leave at the door" }
```

Success `201`:
```json
{ "order_id": 501, "customer_id": 1, "total": 49.9, "status": "open" }
```
Errors: `400` empty items, `404` unknown customer.

### POST `orders/cancelOrder.php` — `{order_id, reason?}`
Auth: true
Cancels an open order. A heading-style endpoint may carry its body shorthand after the path.

Errors: `409` order already shipped.

## Reports

<!--
BASE PATH
When a heading has no `prefix/`, give the section one on its own line:
"Base path: `reports/`". Without any prefix the parser warns that the
path could not be resolved.
-->

Base path: `reports/`

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | `fetch/getSalesSummary.php?from_date=YYYY-MM-DD` | `reports:view` | true | Sales totals from a date; `?to_date=YYYY-MM-DD` limits the range |

## Reference data — `masters/`

<!--
REFERENCE (MASTER DATA) TABLES
One row per lookup entity instead of one row per endpoint. The column
headers say what each cell is; put the HTTP method(s) in parentheses:
  Entity | List (GET) | Single (GET) | Create / Update (POST) | Remove (POST/DELETE) | Permission | Auth
The Auth value applies to every endpoint in that entity row. Cells hold
the endpoint in backticks (leave a cell empty if the entity has no such
endpoint). Permissions are inferred from the column names
(List/Single -> view, Create -> add, Update -> edit, Remove -> delete)
and matched against the codes in the Permission column. The parser
reports one INFERRED_PERMISSION warning per reference table to say so.
-->

| Entity | List (GET) | Single (GET) | Create / Update (POST) | Remove (POST/DELETE) | Permission | Auth |
|---|---|---|---|---|---|---|
| Countries | `fetch/getCountries.php` | `fetch/getCountry.php?country_id=1` | `modify/insertUpdateCountry.php` | `remove/removeCountry.php` | `countries:view`/`add`/`edit`/`delete` | true |
| Currencies | `fetch/getCurrencies.php` | `fetch/getCurrency.php?currency_id=1` | `modify/insertUpdateCurrency.php` | `remove/removeCurrency.php` | `currencies:view`/`add`/`edit`/`delete` | true |

---

## Health — `public/`

### GET `public/status.php`
Auth: false
No token required. Returns `ok` when the service is up.

<!--
=====================================================================
COMMON MISTAKES
=====================================================================
- Endpoints, parameters, permissions and status codes outside
  `backticks` are not recognised.
- A table needs the header row "Method | Endpoint" (and a separator row
  of dashes) or it is ignored. Plain bullet lists of endpoints are not
  read.
- A section heading without `prefix/` and without a "Base path:" line
  produces paths without a prefix and an UNRESOLVED_PREFIX warning.
- A JSON block needs a label ("Request:", "Response `data`:", or
  `file.php` request:) directly above it; otherwise it is not bound to
  any endpoint.
- GET endpoints cannot have a request body; a body documented for GET
  is ignored with a warning.
- Invalid JSON inside a ```json block is reported as INVALID_JSON_BLOCK;
  use plain placeholders such as "<jwt>" inside strings. Trailing
  `//` comments on JSON fields are supported for field requirements
  (for example, `// valid email format` or `// minimum 8 characters`).
- Put notes UNDER the table that they describe, not above it.
- Use \| for a literal "|" in a table cell, or the cell is split.
=====================================================================
-->
