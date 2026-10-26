<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$authUserId = (int)$auth['id'];
$authUserRole = $auth['role'] ?? 'developer';

$data = getRequestData();
$userId = isset($data['id']) ? (int)$data['id'] : (int)($data['user_id'] ?? 0);

if ($userId <= 0) {
    sendError('user_id is required', 400);
}

if ($authUserRole !== 'admin' && $authUserId !== $userId) {
    sendError('Admin authorization required to delete other users', 403);
}

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("UPDATE users SET is_deleted = 1, status = 'inactive' WHERE id = :id AND is_deleted = 0");
    $stmt->execute(['id' => $userId]);

    if ($stmt->rowCount() === 0) {
        sendError('User not found or already deleted', 404);
    }

    sendSuccess(['id' => $userId], 'User deleted successfully');
} catch (PDOException $e) {
    error_log('Remove User Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
