<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("
        SELECT id, name, email, avatar, role, status, created_at, updated_at
        FROM users
        WHERE is_deleted = 0
        ORDER BY created_at DESC
    ");
    $stmt->execute();
    $users = $stmt->fetchAll();

    sendSuccess($users, 'Users fetched successfully');
} catch (PDOException $e) {
    error_log('Get Users Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
