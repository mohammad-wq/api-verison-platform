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

    $stmt = $pdo->prepare("
        SELECT 
            v.id,
            v.project_id,
            v.version,
            v.content_hash,
            v.author_id,
            v.note,
            v.is_latest,
            v.created_at,
            v.updated_at,
            u.name AS author_name,
            u.email AS author_email
        FROM versions v
        INNER JOIN users u ON u.id = v.author_id
        WHERE v.project_id = :project_id AND v.is_deleted = 0
        ORDER BY v.is_latest DESC, v.created_at DESC
    ");
    $stmt->execute(['project_id' => $projectId]);
    $versions = $stmt->fetchAll();

    foreach ($versions as &$v) {
        $v['is_latest'] = (bool)$v['is_latest'];
    }

    sendSuccess($versions, 'Versions fetched successfully');
} catch (PDOException $e) {
    error_log('Get Versions Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
