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
            sl.id,
            sl.project_id,
            sl.created_by_id,
            sl.token,
            sl.environment,
            sl.label,
            sl.expires_at,
            sl.revoked_at,
            sl.created_at,
            u.name AS created_by_name,
            CASE 
                WHEN sl.revoked_at IS NOT NULL THEN 'revoked'
                WHEN sl.expires_at < CURRENT_TIMESTAMP THEN 'expired'
                ELSE 'active'
            END AS link_status
        FROM share_links sl
        INNER JOIN users u ON u.id = sl.created_by_id
        WHERE sl.project_id = :project_id AND sl.is_deleted = 0
        ORDER BY sl.created_at DESC
    ");
    $stmt->execute(['project_id' => $projectId]);
    $links = $stmt->fetchAll();

    sendSuccess($links, 'Share links fetched successfully');
} catch (PDOException $e) {
    error_log('Get Share Links Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
