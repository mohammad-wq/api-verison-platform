<?php

/**
 * API Version Platform configuration.
 *
 * Copy to your project root as avp.config.php (or run `vendor/bin/avp-serve init`).
 * Keep it out of version control: it holds DB credentials and the JWT secret.
 * Any value can also be overridden by env vars: AVP_DB_HOST, AVP_DB_PORT, AVP_DB_NAME, AVP_DB_USER,
 * AVP_DB_PASS, AVP_DB_CHARSET, AVP_JWT_SECRET, AVP_JWT_EXPIRATION, AVP_HOST, AVP_PORT.
 */

return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'api_versioning',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],
    'jwt' => [
        'secret' => 'change-me-to-a-random-64-char-string',
        'expiration' => 604800, // seconds (7 days)
    ],
    'server' => [
        'host' => '127.0.0.1',
        'port' => 8080,
    ],
];
