<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();
$userId = (int)$auth['id'];

$projectId = isset($_GET['id']) ? (int)$_GET['id'] : (int)($_GET['project_id'] ?? 0);
if ($projectId <= 0) {
    sendError('project_id is required', 400);
}

try {
    $pdo = getDBConnection();
    $project = checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor', 'viewer']);

    // Parse JSON columns
    $project['environments'] = !empty($project['environments']) ? json_decode($project['environments'], true) : [];
    $project['auth_config'] = !empty($project['auth_config']) ? json_decode($project['auth_config'], true) : null;

    // Fetch owner info
    $ownerStmt = $pdo->prepare("SELECT id, name, email, avatar FROM users WHERE id = :id");
    $ownerStmt->execute(['id' => $project['owner_id']]);
    $project['owner'] = $ownerStmt->fetch();

    // Fetch members
    $membersStmt = $pdo->prepare("
        SELECT pm.id, pm.user_id, pm.role, pm.created_at, u.name, u.email, u.avatar
        FROM project_members pm
        INNER JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = :project_id AND pm.is_deleted = 0
    ");
    $membersStmt->execute(['project_id' => $projectId]);
    $project['members'] = $membersStmt->fetchAll();

    // Fetch available versions summary
    $verStmt = $pdo->prepare("
        SELECT id, version, content_hash, author_id, note, is_latest, created_at
        FROM versions
        WHERE project_id = :project_id AND is_deleted = 0
        ORDER BY is_latest DESC, created_at DESC
    ");
    $verStmt->execute(['project_id' => $projectId]);
    $project['versions'] = $verStmt->fetchAll();

    sendSuccess($project, 'Project details fetched successfully');
} catch (PDOException $e) {
    error_log('Get Project Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
