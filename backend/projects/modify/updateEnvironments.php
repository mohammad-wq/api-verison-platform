<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$projectId = isset($data['id']) ? (int)$data['id'] : (int)($data['project_id'] ?? 0);
if ($projectId <= 0) {
    sendError('Project id is required', 400);
}

$environments = $data['environments'] ?? null;
if (!is_array($environments)) {
    sendError('environments must be an array', 400);
}
if (count($environments) > 50) {
    sendError('A project can hold at most 50 environments', 400);
}

/**
 * Environments are testing data, not project configuration: every member may
 * manage them so the APIs stay testable, whatever their project role is.
 * (Project details, versions and collaborators keep their own role checks.)
 */
$clean = [];
$seenIds = [];
$seenUrls = [];
foreach ($environments as $index => $environment) {
    $label = 'Environment ' . ($index + 1);
    if (!is_array($environment)) {
        sendError($label . ' must be an object', 400);
    }

    $id = trim((string)($environment['id'] ?? ''));
    $name = trim((string)($environment['name'] ?? ''));
    $baseUrl = rtrim(trim((string)($environment['baseUrl'] ?? '')), '/');

    if ($id === '' || strlen($id) > 100) {
        sendError($label . ' needs an id of at most 100 characters', 400);
    }
    if (isset($seenIds[$id])) {
        sendError($label . ' reuses the id "' . $id . '"', 400);
    }
    if (strlen($name) > 80) {
        sendError($label . ' name is too long (80 characters maximum)', 400);
    }
    if (!filter_var($baseUrl, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $baseUrl)) {
        sendError(($name !== '' ? '"' . $name . '"' : $label) . ' needs an absolute http(s) base URL', 400);
    }
    if (isset($seenUrls[strtolower($baseUrl)])) {
        sendError('Two environments share the base URL ' . $baseUrl, 400);
    }

    $seenIds[$id] = true;
    $seenUrls[strtolower($baseUrl)] = true;
    $entry = ['id' => $id, 'name' => $name, 'baseUrl' => $baseUrl];
    /* Keep the README tag so environments taken from the specification stay labelled. */
    if (($environment['source'] ?? null) === 'readme') {
        $entry['source'] = 'readme';
    }
    $clean[] = $entry;
}

try {
    $pdo = getDBConnection();

    /* Any project member (owner, editor or viewer) may save environments. */
    checkProjectAccess($pdo, $projectId, $userId);

    $stmt = $pdo->prepare('UPDATE projects SET environments = :environments WHERE id = :id AND is_deleted = 0');
    $stmt->execute([
        'environments' => json_encode($clean, JSON_UNESCAPED_SLASHES),
        'id' => $projectId,
    ]);

    sendSuccess(['project_id' => $projectId, 'environments' => $clean], 'Environments updated successfully');
} catch (PDOException $e) {
    error_log('Update Environments Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
