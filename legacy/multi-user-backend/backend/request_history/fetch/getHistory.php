<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();
$userId = (int)$auth['id'];

$projectId = isset($_GET['project_id']) ? (int)$_GET['project_id'] : 0;
$limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 100) : 50;
if ($limit <= 0) $limit = 50;

try {
    $pdo = getDBConnection();

    if ($projectId > 0) {
        checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor', 'viewer']);

        $stmt = $pdo->prepare("
            SELECT rh.*, u.name AS user_name, u.email AS user_email
            FROM request_history rh
            INNER JOIN users u ON u.id = rh.user_id
            WHERE rh.project_id = :project_id
            ORDER BY rh.created_at DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':project_id', $projectId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
    } else {
        $stmt = $pdo->prepare("
            SELECT rh.*, p.name AS project_name, u.name AS user_name, u.email AS user_email
            FROM request_history rh
            INNER JOIN projects p ON p.id = rh.project_id
            INNER JOIN users u ON u.id = rh.user_id
            WHERE rh.user_id = :user_id
            ORDER BY rh.created_at DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
    }

    $history = $stmt->fetchAll();

    foreach ($history as &$row) {
        $row['request_headers'] = !empty($row['request_headers']) ? json_decode($row['request_headers'], true) : null;
        $row['response_headers'] = !empty($row['response_headers']) ? json_decode($row['response_headers'], true) : null;
        $row['duration_ms'] = (int)$row['duration_ms'];
        $row['response_status'] = (int)$row['response_status'];
    }

    sendSuccess($history, 'Request history fetched successfully');
} catch (PDOException $e) {
    error_log('Get Request History Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
