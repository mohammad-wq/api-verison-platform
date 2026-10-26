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
    sendError('project_id is required', 400);
}

try {
    $pdo = getDBConnection();

    // Only owner or admin can delete project
    $project = checkProjectAccess($pdo, $projectId, $userId, ['owner']);
    if ($project['user_role'] !== 'owner' && ($auth['role'] ?? '') !== 'admin') {
        sendError('Only the project owner can delete this project', 403);
    }

    $stmt = $pdo->prepare("UPDATE projects SET is_deleted = 1 WHERE id = :id AND is_deleted = 0");
    $stmt->execute(['id' => $projectId]);

    if ($stmt->rowCount() === 0) {
        sendError('Project not found or already deleted', 404);
    }

    sendSuccess(['project_id' => $projectId], 'Project deleted successfully');
} catch (PDOException $e) {
    error_log('Remove Project Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
