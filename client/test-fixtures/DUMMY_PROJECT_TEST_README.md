# Sample Catalog API

A fictional API for testing the README-to-OpenAPI parser. It manages catalog items, accepts image uploads, and returns JSON, plain text, CSV, and PDF responses.

## Conventions

**Auth.** Every endpoint except `public/health.php` and `public/options.php` requires a bearer token.

**Response envelope.** JSON responses use this envelope:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {},
  "timestamp": "2026-10-16T10:00:00Z"
}
```

**Paginated list envelope.** List endpoints return items and pagination metadata in `data`:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 0,
    "total_pages": 0
  }
}
```

Accepts `?page=` (default 1), `?page_size=` (default 20, max 100), and `?sort=created_at|name`.

## Public status — `public/`

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | `health.php` |  | false | Returns the service health as JSON. |
| HEAD | `health.php` |  | false | Returns headers only so clients can check availability. |
| OPTIONS | `options.php` |  | false | Describes the methods allowed by this API. |

### GET `health.php`

Response `data`:
```json
{
  "status": "ok",
  "service": "Sample Catalog API",
  "checked_at": "2026-10-16T10:00:00Z"
}
```

### OPTIONS `options.php`

Response:
```json
{
  "allow": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
}
```

## Catalog items — `api/items/`

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | `items.php?page=1&page_size=20&sort=name` | `items:view` | true | Paginated list of items. `?search=` matches item name or SKU. |
| GET | `item.php/{item_id}` | `items:view` | true | Returns one item by its required path identifier. |
| POST | `items.php` | `items:add` | true | Creates an item from a nested JSON body. `409` SKU already exists. |
| PUT | `item.php/{item_id}` | `items:edit` | true | Replaces the editable fields of an item. |
| PATCH | `item.php/{item_id}` | `items:edit` | true | Changes selected item fields without replacing the whole item. |
| DELETE | `item.php/{item_id}` | `items:delete` | true | Soft-deletes an item. `409` item is referenced by an order. |

### GET `items.php`

Query params: `category` (`books`, `games`, `stationery`; default `books`), `active` (`true`, `false`; default `true`).

Response `data`:
```json
{
  "items": [
    {
      "item_id": 101,
      "sku": "BK-101",
      "name": "Field Guide",
      "price": 18.5,
      "active": true,
      "category": {
        "id": 4,
        "name": "Books"
      },
      "tags": ["reference", "outdoors"]
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

### POST `items.php`

Requests must include the `Idempotency-Key` header.

Request:
```json
{
  "sku": "GM-204",
  "name": "Puzzle Set",
  "price": 24.95,
  "active": true,
  "category": {
    "id": 7,
    "name": "Games"
  },
  "tags": ["family", "puzzle"],
  "dimensions": {
    "width_cm": 25.5,
    "height_cm": 18
  }
}
```

Success `201`:
```json
{
  "item_id": 204,
  "sku": "GM-204",
  "name": "Puzzle Set",
  "price": 24.95,
  "active": true,
  "category": {
    "id": 7,
    "name": "Games"
  },
  "tags": ["family", "puzzle"],
  "dimensions": {
    "width_cm": 25.5,
    "height_cm": 18
  }
}
```

Errors: `400` invalid item data, `409` SKU already exists.

### PUT `item.php/{item_id}`

Request:
```json
{
  "sku": "GM-204",
  "name": "Puzzle Set - Revised",
  "price": 26.5,
  "active": true,
  "category": {
    "id": 7,
    "name": "Games"
  },
  "tags": ["family", "puzzle", "new"]
}
```

Response `data`:
```json
{
  "item_id": 204,
  "name": "Puzzle Set - Revised",
  "updated": true
}
```

Errors: `404` item not found.

### PATCH `item.php/{item_id}`

Request:
```json
{
  "price": 22.75,
  "active": false
}
```

Response `data`:
```json
{
  "item_id": 204,
  "price": 22.75,
  "active": false
}
```

### DELETE `item.php/{item_id}`

Response `data`:
```json
{
  "item_id": 204,
  "deleted": true
}
```

## Item images — `api/uploads/`

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| POST | `item-image.php` | `items:edit` | true | `multipart/form-data`: `item_id`, `caption?`, file field `image`. `201` image uploaded. |

## Exports — `api/exports/`

| Method | Endpoint | Permission | Auth | Description |
|---|---|---|---|---|
| GET | `items.csv` | `items:view` | true | Exports a CSV report of catalog items. |
| GET | `catalog.pdf` | `items:view` | true | Downloads a PDF catalog. |
| GET | `catalog.xml` | `items:view` | true | Exports the catalog as XML. |
| GET | `health.txt` |  | false | Returns a short plain-text health report. |

### GET `items.csv`

Response: text/csv

### GET `catalog.pdf`

Response: application/pdf (binary)

### GET `catalog.xml`

Response: application/xml

### GET `health.txt`

Response: text/plain
