<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$projectId = isset($data['project_id']) ? (int)$data['project_id'] : 0;
$historyId = isset($data['id']) ? (int)$data['id'] : 0;

try {
    $pdo = getDBConnection();

    if ($historyId > 0) {
        $stmt = $pdo->prepare("DELETE FROM request_history WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $historyId, 'user_id' => $userId]);
    } elseif ($projectId > 0) {
        checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor', 'viewer']);
        $stmt = $pdo->prepare("DELETE FROM request_history WHERE project_id = :project_id AND user_id = :user_id");
        $stmt->execute(['project_id' => $projectId, 'user_id' => $userId]);
    } else {
        $stmt = $pdo->prepare("DELETE FROM request_history WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $userId]);
    }

    sendSuccess(null, 'History cleared successfully');
} catch (PDOException $e) {
    error_log('Clear History Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
