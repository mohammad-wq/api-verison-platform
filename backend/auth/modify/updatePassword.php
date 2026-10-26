<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$data = getRequestData();

$currentPassword = $data['current_password'] ?? '';
$newPassword = $data['new_password'] ?? '';

if (empty($currentPassword) || empty($newPassword)) {
    sendError('Current password and new password are required', 400);
}

if (strlen($newPassword) < 6) {
    sendError('New password must be at least 6 characters long', 400);
}

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("SELECT password FROM users WHERE id = :id AND is_deleted = 0");
    $stmt->execute(['id' => $auth['id']]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($currentPassword, $user['password'])) {
        sendError('Current password is incorrect', 400);
    }

    $hashed = password_hash($newPassword, PASSWORD_DEFAULT);
    $upStmt = $pdo->prepare("UPDATE users SET password = :password WHERE id = :id");
    $upStmt->execute(['password' => $hashed, 'id' => $auth['id']]);

    sendSuccess(null, 'Password updated successfully');
} catch (PDOException $e) {
    error_log('Update Password Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
