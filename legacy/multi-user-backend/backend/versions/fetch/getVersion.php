<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();
$userId = (int)$auth['id'];

$versionId = isset($_GET['id']) ? (int)$_GET['id'] : (int)($_GET['version_id'] ?? 0);
$projectId = isset($_GET['project_id']) ? (int)$_GET['project_id'] : 0;
$versionName = trim($_GET['version'] ?? '');

if ($versionId <= 0 && ($projectId <= 0 || empty($versionName))) {
    sendError('version_id or (project_id and version) is required', 400);
}

try {
    $pdo = getDBConnection();

    if ($versionId > 0) {
        $stmt = $pdo->prepare("
            SELECT v.*, u.name AS author_name, u.email AS author_email
            FROM versions v
            INNER JOIN users u ON u.id = v.author_id
            WHERE v.id = :id AND v.is_deleted = 0
        ");
        $stmt->execute(['id' => $versionId]);
    } else {
        $stmt = $pdo->prepare("
            SELECT v.*, u.name AS author_name, u.email AS author_email
            FROM versions v
            INNER JOIN users u ON u.id = v.author_id
            WHERE v.project_id = :project_id AND v.version = :version AND v.is_deleted = 0
        ");
        $stmt->execute(['project_id' => $projectId, 'version' => $versionName]);
    }

    $version = $stmt->fetch();
    if (!$version) {
        sendError('Version not found', 404);
    }

    // Verify project access
    checkProjectAccess($pdo, (int)$version['project_id'], $userId, ['owner', 'editor', 'viewer']);

    // Parse openapi JSON
    if (!empty($version['openapi'])) {
        $version['openapi'] = is_string($version['openapi']) ? json_decode($version['openapi'], true) : $version['openapi'];
    }

    $version['is_latest'] = (bool)$version['is_latest'];

    sendSuccess($version, 'Version fetched successfully');
} catch (PDOException $e) {
    error_log('Get Version Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
