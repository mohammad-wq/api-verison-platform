<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$versionId = isset($data['id']) ? (int)$data['id'] : (int)($data['version_id'] ?? 0);
if ($versionId <= 0) {
    sendError('version_id is required', 400);
}

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("SELECT id, project_id, is_latest FROM versions WHERE id = :id AND is_deleted = 0");
    $stmt->execute(['id' => $versionId]);
    $version = $stmt->fetch();

    if (!$version) {
        sendError('Version not found', 404);
    }

    checkProjectAccess($pdo, (int)$version['project_id'], $userId, ['owner', 'editor']);

    $pdo->beginTransaction();

    $delStmt = $pdo->prepare("UPDATE versions SET is_deleted = 1, is_latest = 0 WHERE id = :id");
    $delStmt->execute(['id' => $versionId]);

    // If deleted version was latest, designate newest remaining version as latest
    if ($version['is_latest']) {
        $promoteStmt = $pdo->prepare("
            UPDATE versions 
            SET is_latest = 1 
            WHERE project_id = :project_id AND is_deleted = 0 
            ORDER BY created_at DESC 
            LIMIT 1
        ");
        $promoteStmt->execute(['project_id' => $version['project_id']]);
    }

    $pdo->commit();

    sendSuccess(['id' => $versionId], 'Version deleted successfully');
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Remove Version Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
