<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();
$userId = (int)$auth['id'];

$projectId = isset($_GET['project_id']) ? (int)$_GET['project_id'] : 0;
if ($projectId <= 0) {
    sendError('project_id is required', 400);
}

try {
    $pdo = getDBConnection();
    checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor', 'viewer']);

    // Fetch latest version
    $stmt = $pdo->prepare("
        SELECT v.*, u.name AS author_name, u.email AS author_email
        FROM versions v
        INNER JOIN users u ON u.id = v.author_id
        WHERE v.project_id = :project_id AND v.is_deleted = 0
        ORDER BY v.is_latest DESC, v.created_at DESC
        LIMIT 1
    ");
    $stmt->execute(['project_id' => $projectId]);
    $version = $stmt->fetch();

    if (!$version) {
        sendError('No versions found for this project', 404);
    }

    if (!empty($version['openapi'])) {
        $version['openapi'] = is_string($version['openapi']) ? json_decode($version['openapi'], true) : $version['openapi'];
    }

    $version['is_latest'] = (bool)$version['is_latest'];

    sendSuccess($version, 'Latest version fetched successfully');
} catch (PDOException $e) {
    error_log('Get Latest Version Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
