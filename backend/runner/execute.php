<?php
require_once dirname(__DIR__) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$projectId = isset($data['project_id']) ? (int)$data['project_id'] : 0;
$method = strtoupper(trim($data['method'] ?? 'GET'));
$url = trim($data['url'] ?? '');
$headers = $data['headers'] ?? [];
$body = $data['body'] ?? null;
$environment = trim($data['environment'] ?? '');
$saveHistory = isset($data['save_history']) ? (bool)$data['save_history'] : true;

if (empty($url)) {
    sendError('url is required', 400);
}

if (!filter_var($url, FILTER_VALIDATE_URL)) {
    sendError('Invalid target URL', 400);
}

$allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
if (!in_array($method, $allowedMethods, true)) {
    sendError('Unsupported HTTP method: ' . $method, 400);
}

$startTime = microtime(true);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

// Format headers
$curlHeaders = [];
if (is_array($headers)) {
    foreach ($headers as $key => $value) {
        if (is_string($key)) {
            $curlHeaders[] = "{$key}: {$value}";
        } else {
            $curlHeaders[] = $value;
        }
    }
}
if (!empty($curlHeaders)) {
    curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);
}

// Attach body if present
if ($body !== null && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
    $bodyPayload = is_array($body) ? json_encode($body, JSON_UNESCAPED_SLASHES) : (string)$body;
    curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyPayload);
}

$response = curl_exec($ch);
$durationMs = (int)round((microtime(true) - $startTime) * 1000);

if ($response === false) {
    $curlError = curl_error($ch);
    $curlErrno = curl_errno($ch);
    curl_close($ch);
    sendError("Request execution failed: [{$curlErrno}] {$curlError}", 502, [
        'duration_ms' => $durationMs,
        'url' => $url,
        'method' => $method
    ]);
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$rawHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);

// Parse response headers into array
$parsedHeaders = [];
foreach (explode("\r\n", $rawHeaders) as $line) {
    if (strpos($line, ':') !== false) {
        [$hKey, $hVal] = explode(':', $line, 2);
        $parsedHeaders[trim($hKey)] = trim($hVal);
    }
}

// Try parsing body as JSON
$parsedBody = json_decode($responseBody, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    $parsedBody = $responseBody;
}

// Log to request_history if project specified and enabled
if ($saveHistory && $projectId > 0) {
    try {
        $pdo = getDBConnection();
        $historyStmt = $pdo->prepare("
            INSERT INTO request_history (
                project_id, user_id, environment, method, url,
                request_headers, request_body, response_status, response_headers, response_body, duration_ms
            ) VALUES (
                :project_id, :user_id, :environment, :method, :url,
                :request_headers, :request_body, :response_status, :response_headers, :response_body, :duration_ms
            )
        ");
        $historyStmt->execute([
            'project_id' => $projectId,
            'user_id' => $userId,
            'environment' => !empty($environment) ? $environment : null,
            'method' => $method,
            'url' => $url,
            'request_headers' => is_array($headers) ? json_encode($headers) : null,
            'request_body' => is_array($body) ? json_encode($body) : (string)$body,
            'response_status' => $statusCode,
            'response_headers' => json_encode($parsedHeaders),
            'response_body' => is_string($responseBody) ? substr($responseBody, 0, 100000) : json_encode($parsedBody),
            'duration_ms' => $durationMs
        ]);
    } catch (Throwable $e) {
        error_log('Failed to log test execution history: ' . $e->getMessage());
    }
}

sendSuccess([
    'status' => $statusCode,
    'headers' => $parsedHeaders,
    'body' => $parsedBody,
    'duration_ms' => $durationMs
], 'API request executed successfully');
?>
