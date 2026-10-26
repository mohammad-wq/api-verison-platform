<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$authUserId = (int)$auth['id'];
$authUserRole = $auth['role'] ?? 'developer';

// Multipart/form-data or form post
$data = getRequestData();

$userId = isset($data['id']) ? (int)$data['id'] : (int)($data['user_id'] ?? 0);
$isUpdate = $userId > 0;

$name = isset($data['name']) ? trim($data['name']) : null;
$email = isset($data['email']) ? trim(strtolower($data['email'])) : null;
$password = isset($data['password']) ? $data['password'] : null;
$role = isset($data['role']) ? trim($data['role']) : null;
$status = isset($data['status']) ? trim($data['status']) : null;

// Permission check: regular developers can only update themselves, admins can insert or update anyone
if ($isUpdate && $userId !== $authUserId && $authUserRole !== 'admin') {
    sendError('Permission denied. You can only update your own user account.', 403);
}

if (!$isUpdate && $authUserRole !== 'admin') {
    sendError('Admin authorization required to create users via this endpoint. Use register instead.', 403);
}

if (!$isUpdate) {
    if (empty($name) || empty($email) || empty($password)) {
        sendError('name, email, and password are required for new users', 400);
    }
}

if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendError('Invalid email format', 400);
}

if ($password !== null && !empty($password) && strlen($password) < 6) {
    sendError('Password must be at least 6 characters long', 400);
}

$allowedRoles = ['admin', 'developer'];
if ($role !== null && !in_array($role, $allowedRoles, true)) {
    sendError('Invalid role. Allowed: admin, developer', 400);
}

$allowedStatuses = ['active', 'inactive', 'suspended'];
if ($status !== null && !in_array($status, $allowedStatuses, true)) {
    sendError('Invalid status. Allowed: active, inactive, suspended', 400);
}

// Process avatar upload if present
$avatarPath = null;
if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] !== UPLOAD_ERR_NO_FILE) {
    $avatarPath = processAvatarUpload($_FILES['avatar']);
}

try {
    $pdo = getDBConnection();

    if ($isUpdate) {
        // Verify user exists
        $existStmt = $pdo->prepare("SELECT id, avatar FROM users WHERE id = :id AND is_deleted = 0");
        $existStmt->execute(['id' => $userId]);
        $existingUser = $existStmt->fetch();

        if (!$existingUser) {
            sendError('User not found', 404);
        }

        // Check email uniqueness if email provided
        if ($email !== null) {
            $dupStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email AND id != :id AND is_deleted = 0");
            $dupStmt->execute(['email' => $email, 'id' => $userId]);
            if ($dupStmt->fetch()) {
                sendError("Email '{$email}' is already in use by another account", 409);
            }
        }

        $fields = [];
        $params = ['id' => $userId];

        if ($name !== null && $name !== '') {
            $fields[] = 'name = :name';
            $params['name'] = $name;
        }
        if ($email !== null && $email !== '') {
            $fields[] = 'email = :email';
            $params['email'] = $email;
        }
        if (!empty($password)) {
            $fields[] = 'password = :password';
            $params['password'] = password_hash($password, PASSWORD_DEFAULT);
        }
        if ($role !== null && $authUserRole === 'admin') {
            $fields[] = 'role = :role';
            $params['role'] = $role;
        }
        if ($status !== null && $authUserRole === 'admin') {
            $fields[] = 'status = :status';
            $params['status'] = $status;
        }
        if ($avatarPath !== null) {
            $fields[] = 'avatar = :avatar';
            $params['avatar'] = $avatarPath;
        }

        if (!empty($fields)) {
            $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id";
            $upStmt = $pdo->prepare($sql);
            $upStmt->execute($params);
        }

        $uStmt = $pdo->prepare("SELECT id, name, email, avatar, role, status, created_at, updated_at FROM users WHERE id = :id");
        $uStmt->execute(['id' => $userId]);
        $updatedUser = $uStmt->fetch();

        sendSuccess($updatedUser, 'User updated successfully');
    } else {
        // Insert new user
        $dupStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email AND is_deleted = 0");
        $dupStmt->execute(['email' => $email]);
        if ($dupStmt->fetch()) {
            sendError('Email is already registered', 409);
        }

        $stmt = $pdo->prepare("
            INSERT INTO users (name, email, password, avatar, role, status)
            VALUES (:name, :email, :password, :avatar, :role, :status)
        ");
        $stmt->execute([
            'name' => $name,
            'email' => $email,
            'password' => password_hash($password, PASSWORD_DEFAULT),
            'avatar' => $avatarPath,
            'role' => $role ?? 'developer',
            'status' => $status ?? 'active'
        ]);

        $newUserId = (int)$pdo->lastInsertId();

        $uStmt = $pdo->prepare("SELECT id, name, email, avatar, role, status, created_at, updated_at FROM users WHERE id = :id");
        $uStmt->execute(['id' => $newUserId]);
        $newUser = $uStmt->fetch();

        sendSuccess($newUser, 'User created successfully', 201);
    }
} catch (PDOException $e) {
    error_log('Insert/Update User Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
