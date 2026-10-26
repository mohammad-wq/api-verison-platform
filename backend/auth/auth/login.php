<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$data = getRequestData();

$email = trim(strtolower($data['email'] ?? ''));
$password = $data['password'] ?? '';

if (empty($email) || empty($password)) {
    sendError('Email and password are required', 400);
}

try {
    $pdo = getDBConnection();

    $stmt = $pdo->prepare("
        SELECT id, name, email, password, avatar, role, status, is_deleted
        FROM users
        WHERE email = :email AND is_deleted = 0
    ");
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        sendError('Invalid email or password', 401);
    }

    if ($user['status'] !== 'active') {
        sendError('Account is ' . $user['status'] . '. Please contact support.', 403);
    }

    unset($user['password']);
    unset($user['is_deleted']);

    $tokenPayload = [
        'id' => (int)$user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role']
    ];

    $token = generateJWT($tokenPayload);

    sendSuccess([
        'user' => $user,
        'token' => $token
    ], 'Login successful');
} catch (PDOException $e) {
    error_log('Login Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
