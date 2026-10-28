<?php
require_once dirname(__DIR__, 2) . '/config.php';

$auth = requireAuth();
$userId = (int)$auth['id'];

try {
    $pdo = getDBConnection();

    // Fetch projects owned by user or where user is an active member
    $stmt = $pdo->prepare("
        SELECT 
            p.id,
            p.name,
            p.description,
            p.owner_id,
            p.environments,
            p.auth_config,
            p.created_at,
            p.updated_at,
            u.name AS owner_name,
            u.email AS owner_email,
            COALESCE(pm.role, CASE WHEN p.owner_id = :role_user_id THEN 'owner' ELSE NULL END) AS user_role,
            (SELECT COUNT(*) FROM versions v WHERE v.project_id = p.id AND v.is_deleted = 0) AS versions_count,
            (SELECT v.version FROM versions v WHERE v.project_id = p.id AND v.is_deleted = 0 AND v.is_latest = 1 LIMIT 1) AS latest_version
        FROM projects p
        INNER JOIN users u ON u.id = p.owner_id
        LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = :member_user_id AND pm.is_deleted = 0
        WHERE p.is_deleted = 0 
          AND (p.owner_id = :owner_user_id OR pm.id IS NOT NULL)
        ORDER BY p.updated_at DESC
    ");
    $stmt->execute([
        'role_user_id' => $userId,
        'member_user_id' => $userId,
        'owner_user_id' => $userId
    ]);
    $projects = $stmt->fetchAll();

    foreach ($projects as &$proj) {
        $proj['environments'] = !empty($proj['environments']) ? json_decode($proj['environments'], true) : [];
        $proj['auth_config'] = !empty($proj['auth_config']) ? json_decode($proj['auth_config'], true) : null;
        $proj['versions_count'] = (int)$proj['versions_count'];
    }

    sendSuccess($projects, 'Projects fetched successfully');
} catch (PDOException $e) {
    error_log('Get Projects Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
