<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$data = getRequestData();

$name = isset($data['name']) ? trim($data['name']) : null;

// Process avatar upload if present
$avatarPath = null;
if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] !== UPLOAD_ERR_NO_FILE) {
    $avatarPath = processAvatarUpload($_FILES['avatar']);
} elseif (!empty($data['avatar']) && is_string($data['avatar'])) {
    $avatarPath = trim($data['avatar']);
}

try {
    $pdo = getDBConnection();

    $fields = [];
    $params = ['id' => $auth['id']];

    if ($name !== null && $name !== '') {
        $fields[] = 'name = :name';
        $params['name'] = $name;
    }
    if ($avatarPath !== null) {
        $fields[] = 'avatar = :avatar';
        $params['avatar'] = $avatarPath;
    }

    if (!empty($fields)) {
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id AND is_deleted = 0";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    }

    $userStmt = $pdo->prepare("SELECT id, name, email, avatar, role, status FROM users WHERE id = :id");
    $userStmt->execute(['id' => $auth['id']]);
    $user = $userStmt->fetch();

    sendSuccess($user, 'Profile updated successfully');
} catch (PDOException $e) {
    error_log('Update Profile Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
