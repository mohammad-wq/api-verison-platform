<?php
require_once dirname(__DIR__, 2) . '/config.php';

$token = trim($_GET['token'] ?? '');
if (empty($token)) {
    sendError('token is required', 400);
}

try {
    $pdo = getDBConnection();

    // Find share link
    $stmt = $pdo->prepare("
        SELECT 
            sl.*, 
            p.name AS project_name, 
            p.description AS project_description,
            p.environments,
            p.auth_config
        FROM share_links sl
        INNER JOIN projects p ON p.id = sl.project_id
        WHERE sl.token = :token AND sl.is_deleted = 0 AND p.is_deleted = 0
    ");
    $stmt->execute(['token' => $token]);
    $link = $stmt->fetch();

    if (!$link) {
        sendError('Invalid or expired share link', 404);
    }

    if (!empty($link['revoked_at'])) {
        sendError('This share link has been revoked', 410);
    }

    if (strtotime($link['expires_at']) < time()) {
        sendError('This share link has expired', 410);
    }

    // Fetch latest version of this project
    $verStmt = $pdo->prepare("
        SELECT id, version, openapi, content_hash, created_at, updated_at
        FROM versions
        WHERE project_id = :project_id AND is_deleted = 0
        ORDER BY is_latest DESC, created_at DESC
        LIMIT 1
    ");
    $verStmt->execute(['project_id' => $link['project_id']]);
    $version = $verStmt->fetch();

    if ($version && !empty($version['openapi'])) {
        $version['openapi'] = is_string($version['openapi']) ? json_decode($version['openapi'], true) : $version['openapi'];
    }

    $link['environments'] = !empty($link['environments']) ? json_decode($link['environments'], true) : [];
    $link['auth_config'] = !empty($link['auth_config']) ? json_decode($link['auth_config'], true) : null;
    $link['latest_version'] = $version;

    sendSuccess($link, 'Share link data retrieved successfully');
} catch (PDOException $e) {
    error_log('Get Share Link Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
