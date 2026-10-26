<?php

/**
 * Router for PHP's built-in server (`php -S ... src/router.php`). Not used in production web servers.
 *
 *  /backend/*.php     -> bundled PHP backend script
 *  /backend/uploads/* -> uploaded files
 *  existing UI files  -> served natively by the built-in server
 *  anything else      -> resources/ui/index.html (SPA fallback for client-side routes)
 */

declare(strict_types=1);

$uiDir = realpath(__DIR__ . '/../resources/ui');
$backendDir = realpath(__DIR__ . '/../backend');
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');

function avpNotFound(): bool
{
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['statusCode' => 404, 'message' => 'Not Found', 'data' => null, 'timestamp' => date('Y-m-d H:i:s')]);
    return true;
}

/** Resolve $relative inside $root, rejecting traversal outside it. */
function avpResolve(string|false $root, string $relative): ?string
{
    if ($root === false) {
        return null;
    }
    $target = realpath($root . $relative);
    if ($target === false || !is_file($target) || !str_starts_with($target, $root . DIRECTORY_SEPARATOR)) {
        return null;
    }
    return $target;
}

if (preg_match('#^/backend(/.*)$#', $path, $m)) {
    $relative = $m[1];
    $target = avpResolve($backendDir, $relative);
    if ($target === null) {
        return avpNotFound();
    }

    if (strtolower(pathinfo($target, PATHINFO_EXTENSION)) === 'php') {
        // Make the target look like the executed script so the backend's direct-access guards work.
        $_SERVER['SCRIPT_FILENAME'] = $target;
        $_SERVER['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] = '/backend' . $relative;
        chdir(dirname($target));
        require $target;
        return true;
    }

    if (str_starts_with($relative, '/uploads/')) {
        $mime = function_exists('mime_content_type') ? mime_content_type($target) : false;
        header('Content-Type: ' . ($mime ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($target));
        readfile($target);
        return true;
    }

    return avpNotFound();
}

if ($path !== '/' && avpResolve($uiDir, $path) !== null) {
    return false;
}

$index = $uiDir === false ? null : $uiDir . DIRECTORY_SEPARATOR . 'index.html';
if ($index === null || !is_file($index)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "UI bundle missing: resources/ui/index.html. Copy the Vite build (client/dist) into it with `php scripts/sync.php --ui=<path>`.\n";
    return true;
}

header('Content-Type: text/html; charset=utf-8');
readfile($index);
return true;
