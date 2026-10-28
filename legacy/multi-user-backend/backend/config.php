<?php
// Package version of php_backend/config.php: identical behaviour, but credentials and the JWT secret
// come from the host project's avp.config.php / AVP_* env vars instead of being hardcoded.
// scripts/sync.php copies this over backend/config.php on every sync.

// Robust CORS handling for API requests
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
} else {
    header("Access-Control-Allow-Origin: *");
}

header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Origin, Accept');
header('Content-Type: application/json; charset=utf-8');

// Security headers
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');

// Handle Preflight (OPTIONS) requests immediately
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Include response format functions early
require_once __DIR__ . '/includes/responseFormat.php';

if (basename($_SERVER['PHP_SELF']) === basename(__FILE__)) {
    sendError('Access denied. This resource is protected and cannot be accessed directly.', 403);
}

require_once dirname(__DIR__) . '/src/Config.php';

try {
    $avpConfig = \Dawatkhi\ApiVersionPlatform\Config::load();
} catch (RuntimeException $e) {
    error_log('AVP Config Error: ' . $e->getMessage());
    sendError('Server configuration error.', 500);
}

// Defined before jwt.php so its fallback secret is never used
define('JWT_SECRET', $avpConfig['jwt']['secret']);
define('JWT_EXPIRATION', $avpConfig['jwt']['expiration']);

// Include JWT helper functions
require_once __DIR__ . '/includes/jwt.php';

// Include Project & OpenAPI helpers
require_once __DIR__ . '/includes/helpers.php';

// Database credentials
define('DB_HOST', $avpConfig['db']['host']);
define('DB_PORT', $avpConfig['db']['port']);
define('DB_NAME', $avpConfig['db']['name']);
define('DB_USER', $avpConfig['db']['user']);
define('DB_PASS', $avpConfig['db']['pass']);
define('DB_CHARSET', $avpConfig['db']['charset']);

/**
 * Get singleton PDO Database Connection
 *
 * @return PDO
 */
function getDBConnection(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_PERSISTENT => false,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_FOUND_ROWS => true,
            ]);
        } catch (PDOException $e) {
            error_log('Database Connection Error: ' . $e->getMessage());
            sendError('Database connection failed. Please ensure MySQL is running and avp.config.php is configured.', 500);
        }
    }

    return $pdo;
}
