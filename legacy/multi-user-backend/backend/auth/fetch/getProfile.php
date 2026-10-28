<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("
        SELECT id, name, email, avatar, role, status, created_at, updated_at
        FROM users
        WHERE id = :id AND is_deleted = 0
    ");
    $stmt->execute(['id' => $auth['id']]);
    $user = $stmt->fetch();

    if (!$user) {
        sendError('User not found', 404);
    }

    sendSuccess($user, 'User profile fetched successfully');
} catch (PDOException $e) {
    error_log('Get Profile Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
