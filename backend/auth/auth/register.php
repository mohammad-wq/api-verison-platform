<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

// Support multipart/form-data as well as JSON
$data = getRequestData();

$name = trim($data['name'] ?? '');
$email = trim(strtolower($data['email'] ?? ''));
$password = $data['password'] ?? '';
$role = $data['role'] ?? 'developer';

if (empty($name) || empty($email) || empty($password)) {
    sendError('Name, email, and password are required', 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendError('Invalid email format', 400);
}

if (strlen($password) < 6) {
    sendError('Password must be at least 6 characters long', 400);
}

$allowedRoles = ['admin', 'developer'];
if (!in_array($role, $allowedRoles, true)) {
    $role = 'developer';
}

// Process avatar file if uploaded (multipart/form-data)
$avatarPath = null;
if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] !== UPLOAD_ERR_NO_FILE) {
    $avatarPath = processAvatarUpload($_FILES['avatar']);
}

try {
    $pdo = getDBConnection();

    // Check if email already registered
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email AND is_deleted = 0");
    $checkStmt->execute(['email' => $email]);
    if ($checkStmt->fetch()) {
        sendError('Email is already registered', 409);
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("
        INSERT INTO users (name, email, password, avatar, role, status)
        VALUES (:name, :email, :password, :avatar, :role, 'active')
    ");
    $stmt->execute([
        'name' => $name,
        'email' => $email,
        'password' => $hashedPassword,
        'avatar' => $avatarPath,
        'role' => $role
    ]);

    $userId = (int)$pdo->lastInsertId();

    $userPayload = [
        'id' => $userId,
        'name' => $name,
        'email' => $email,
        'avatar' => $avatarPath,
        'role' => $role,
        'status' => 'active'
    ];

    $token = generateJWT($userPayload);

    sendSuccess([
        'user' => $userPayload,
        'token' => $token
    ], 'User registered successfully', 201);
} catch (PDOException $e) {
    error_log('Registration Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
