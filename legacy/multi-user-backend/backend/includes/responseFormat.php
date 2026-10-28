<?php
if (basename($_SERVER['PHP_SELF']) === basename(__FILE__)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'statusCode' => 403,
        'message' => 'Access denied. This resource is protected and cannot be accessed directly.',
        'data' => null,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT);
    exit;
}

/**
 * Format API response with standard structure
 * 
 * @param int $statusCode HTTP status code
 * @param string $message Success or error message
 * @param mixed $data Response data (array, object, or null)
 * @return string JSON encoded response
 */
function formatResponse(int $statusCode, string $message, $data = null): string
{
    $payload = [
        'statusCode' => $statusCode,
        'message' => $message,
        'data' => $data,
        'timestamp' => date('Y-m-d H:i:s')
    ];

    return json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}

/**
 * Send JSON response and exit
 * 
 * @param int $statusCode HTTP status code
 * @param string $message Success or error message
 * @param mixed $data Response data
 * @return void
 */
function sendResponse(int $statusCode, string $message, $data = null): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo formatResponse($statusCode, $message, $data);
    exit;
}

/**
 * Send success response
 * 
 * @param mixed $data Response data
 * @param string $message Success message
 * @param int $statusCode HTTP status code (default: 200)
 * @return void
 */
function sendSuccess($data = null, string $message = 'Success', int $statusCode = 200): void
{
    sendResponse($statusCode, $message, $data);
}

/**
 * Send error response
 * 
 * @param string $message Error message
 * @param int $statusCode HTTP status code (default: 400)
 * @param mixed $data Additional error data
 * @return void
 */
function sendError(string $message, int $statusCode = 400, $data = null): void
{
    sendResponse($statusCode, $message, $data);
}

/**
 * Format SQL errors to be user-friendly
 * 
 * @param \PDOException $e
 * @return string
 */
function formatSqlError(\PDOException $e): string
{
    $message = $e->getMessage();

    if (strpos($message, 'Duplicate entry') !== false) {
        if (preg_match("/Duplicate entry '(?P<entry>.*?)' for key '(?P<key>[^']+)'/i", $message, $matches)) {
            $key = trim($matches['key'], '`');
            if (strpos($key, '.') !== false) {
                $key = substr($key, strrpos($key, '.') + 1);
            }
            $cleanKey = preg_replace('/^(uk_|idx_|uq_|unique_)/i', '', $key);
            $cleanKey = preg_replace('/(_unique|_idx)$/i', '', $cleanKey);
            $fieldName = ucwords(str_replace(['_', '-'], ' ', $cleanKey));
            return "{$fieldName} '{$matches['entry']}' already exists.";
        }
        return "A record with this information already exists.";
    }

    if (strpos($message, '1406 Data too long') !== false) {
        if (preg_match("/for column '(.+?)'/", $message, $matches)) {
            $column = ucwords(str_replace(['_', '-'], ' ', $matches[1]));
            return "The data provided for '{$column}' is too long.";
        }
        return "Data too long for one of the columns.";
    }

    if (strpos($message, '1452 Cannot add or update a child row') !== false) {
        return "The referenced information does not exist.";
    }

    if (strpos($message, '1451 Cannot delete or update a parent row') !== false) {
        return "This record cannot be removed because it is referenced elsewhere.";
    }

    if (preg_match("/Incorrect (.+?) value: '.*?' for column '(.+?)'/", $message, $matches)) {
        $column = ucwords(str_replace(['_', '-'], ' ', $matches[2]));
        return "Invalid {$matches[1]} format provided for '{$column}'.";
    }

    if (preg_match("/Out of range value for column '(.+?)'/", $message, $matches)) {
        $column = ucwords(str_replace(['_', '-'], ' ', $matches[1]));
        return "The value provided for '{$column}' is out of range.";
    }

    if (strpos($message, 'cannot be null') !== false && preg_match("/Column '(.+?)'/", $message, $matches)) {
        $column = ucwords(str_replace(['_', '-'], ' ', $matches[1]));
        return "The '{$column}' field cannot be empty.";
    }

    return "Database Error: " . $message;
}

/**
 * Determine appropriate HTTP status code from PDOException
 * 
 * @param \PDOException $e
 * @return int
 */
function getSqlErrorStatusCode(\PDOException $e): int
{
    $message = $e->getMessage();
    if (
        strpos($message, 'Duplicate entry') !== false ||
        strpos($message, 'Data too long') !== false ||
        strpos($message, 'Cannot add or update a child row') !== false ||
        strpos($message, 'Cannot delete or update a parent row') !== false ||
        strpos($message, 'cannot be null') !== false ||
        strpos($message, 'Incorrect') !== false ||
        strpos($message, 'Out of range') !== false
    ) {
        return 400;
    }
    return 500;
}
