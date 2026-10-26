<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$projectId = isset($data['project_id']) ? (int)$data['project_id'] : 0;
$memberEmail = trim(strtolower($data['email'] ?? ''));
$targetUserId = isset($data['user_id']) ? (int)$data['user_id'] : 0;
$role = $data['role'] ?? 'viewer';

if ($projectId <= 0) {
    sendError('project_id is required', 400);
}

$allowedRoles = ['owner', 'editor', 'viewer'];
if (!in_array($role, $allowedRoles, true)) {
    sendError('Invalid role. Must be owner, editor, or viewer', 400);
}

try {
    $pdo = getDBConnection();
    // Only owner can add or modify member roles
    checkProjectAccess($pdo, $projectId, $userId, ['owner']);

    // Find target user by ID or email
    if ($targetUserId > 0) {
        $uStmt = $pdo->prepare("SELECT id, name, email FROM users WHERE id = :id AND is_deleted = 0");
        $uStmt->execute(['id' => $targetUserId]);
    } elseif (!empty($memberEmail)) {
        $uStmt = $pdo->prepare("SELECT id, name, email FROM users WHERE email = :email AND is_deleted = 0");
        $uStmt->execute(['email' => $memberEmail]);
    } else {
        sendError('user_id or email is required', 400);
    }
    $targetUser = $uStmt->fetch();

    if (!$targetUser) {
        sendError('User not found', 404);
    }

    $targetUserId = (int)$targetUser['id'];

    // Check if membership already exists (including soft-deleted)
    $memStmt = $pdo->prepare("
        SELECT id, is_deleted 
        FROM project_members 
        WHERE project_id = :project_id AND user_id = :user_id
    ");
    $memStmt->execute(['project_id' => $projectId, 'user_id' => $targetUserId]);
    $existing = $memStmt->fetch();

    if ($existing) {
        $upStmt = $pdo->prepare("
            UPDATE project_members 
            SET role = :role, is_deleted = 0 
            WHERE id = :id
        ");
        $upStmt->execute(['role' => $role, 'id' => $existing['id']]);
        $memberId = (int)$existing['id'];
    } else {
        $insStmt = $pdo->prepare("
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (:project_id, :user_id, :role)
        ");
        $insStmt->execute([
            'project_id' => $projectId,
            'user_id' => $targetUserId,
            'role' => $role
        ]);
        $memberId = (int)$pdo->lastInsertId();
    }

    sendSuccess([
        'id' => $memberId,
        'project_id' => $projectId,
        'user_id' => $targetUserId,
        'user_name' => $targetUser['name'],
        'email' => $targetUser['email'],
        'role' => $role
    ], 'Member saved successfully');
} catch (PDOException $e) {
    error_log('Insert/Update Member Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
