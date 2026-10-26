<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$projectId = isset($data['project_id']) ? (int)$data['project_id'] : 0;
$memberId = isset($data['member_id']) ? (int)$data['member_id'] : 0;
$targetUserId = isset($data['user_id']) ? (int)$data['user_id'] : 0;

if ($projectId <= 0) {
    sendError('project_id is required', 400);
}

try {
    $pdo = getDBConnection();
    // Only owner can remove members (or a member can remove themselves)
    $project = checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor', 'viewer']);

    // Prevent removing the original project owner
    if ($targetUserId === (int)$project['owner_id']) {
        sendError('Cannot remove project creator/owner', 400);
    }

    if ($project['user_role'] !== 'owner' && $userId !== $targetUserId) {
        sendError('Only project owners can remove other members', 403);
    }

    if ($memberId > 0) {
        $stmt = $pdo->prepare("
            UPDATE project_members 
            SET is_deleted = 1 
            WHERE id = :id AND project_id = :project_id AND is_deleted = 0
        ");
        $stmt->execute(['id' => $memberId, 'project_id' => $projectId]);
    } elseif ($targetUserId > 0) {
        $stmt = $pdo->prepare("
            UPDATE project_members 
            SET is_deleted = 1 
            WHERE user_id = :user_id AND project_id = :project_id AND is_deleted = 0
        ");
        $stmt->execute(['user_id' => $targetUserId, 'project_id' => $projectId]);
    } else {
        sendError('member_id or user_id is required', 400);
    }

    if ($stmt->rowCount() === 0) {
        sendError('Member not found or already removed', 404);
    }

    sendSuccess(['project_id' => $projectId], 'Member removed successfully');
} catch (PDOException $e) {
    error_log('Remove Member Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
