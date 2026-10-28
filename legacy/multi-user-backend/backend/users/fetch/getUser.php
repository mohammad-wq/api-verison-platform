<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();
$userId = isset($_GET['id']) ? (int)$_GET['id'] : (int)($_GET['user_id'] ?? 0);

if ($userId <= 0) {
    sendError('user_id is required', 400);
}

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("
        SELECT id, name, email, avatar, role, status, created_at, updated_at
        FROM users
        WHERE id = :id AND is_deleted = 0
    ");
    $stmt->execute(['id' => $userId]);
    $user = $stmt->fetch();

    if (!$user) {
        sendError('User not found', 404);
    }

    sendSuccess($user, 'User details fetched successfully');
} catch (PDOException $e) {
    error_log('Get User Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
