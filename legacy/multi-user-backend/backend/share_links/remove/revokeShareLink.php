<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$shareId = isset($data['id']) ? (int)$data['id'] : (int)($data['share_id'] ?? 0);
if ($shareId <= 0) {
    sendError('share_id is required', 400);
}

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("SELECT id, project_id FROM share_links WHERE id = :id AND is_deleted = 0");
    $stmt->execute(['id' => $shareId]);
    $link = $stmt->fetch();

    if (!$link) {
        sendError('Share link not found', 404);
    }

    checkProjectAccess($pdo, (int)$link['project_id'], $userId, ['owner', 'editor']);

    $upStmt = $pdo->prepare("
        UPDATE share_links 
        SET revoked_at = CURRENT_TIMESTAMP, is_deleted = 1 
        WHERE id = :id
    ");
    $upStmt->execute(['id' => $shareId]);

    sendSuccess(['id' => $shareId], 'Share link revoked successfully');
} catch (PDOException $e) {
    error_log('Revoke Share Link Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
