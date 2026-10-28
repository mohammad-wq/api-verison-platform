<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$projectId = isset($data['id']) ? (int)$data['id'] : (int)($data['project_id'] ?? 0);
$isUpdate = $projectId > 0;
$hasEnvironments = array_key_exists('environments', $data);
$hasAuthConfig = array_key_exists('auth_config', $data);

$name = trim($data['name'] ?? '');
$description = trim($data['description'] ?? '');
$environments = $data['environments'] ?? [];
$authConfig = $data['auth_config'] ?? null;

if (empty($name)) {
    sendError('Project name is required', 400);
}

// Convert environments to JSON string if passed as array
if (is_array($environments) || is_object($environments)) {
    $environmentsJson = json_encode($environments, JSON_UNESCAPED_SLASHES);
} else {
    $environmentsJson = !empty($environments) ? (string)$environments : '[]';
}

if ($authConfig !== null) {
    if (is_array($authConfig) || is_object($authConfig)) {
        $authConfigJson = json_encode($authConfig, JSON_UNESCAPED_SLASHES);
    } else {
        $authConfigJson = (string)$authConfig;
    }
} else {
    $authConfigJson = null;
}

try {
    $pdo = getDBConnection();

    if ($isUpdate) {
        checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor']);

        $updates = ['name = :name', 'description = :description'];
        $params = [
            'name' => $name,
            'description' => !empty($description) ? $description : null,
        ];
        if ($hasEnvironments) {
            $updates[] = 'environments = :environments';
            $params['environments'] = $environmentsJson;
        }
        if ($hasAuthConfig) {
            $updates[] = 'auth_config = :auth_config';
            $params['auth_config'] = $authConfigJson;
        }
        $params['id'] = $projectId;
        $stmt = $pdo->prepare('UPDATE projects SET ' . implode(', ', $updates) . ' WHERE id = :id AND is_deleted = 0');
        $stmt->execute($params);

        sendSuccess(['project_id' => $projectId], 'Project updated successfully');
    } else {
        $stmt = $pdo->prepare("
            INSERT INTO projects (name, description, owner_id, environments, auth_config)
            VALUES (:name, :description, :owner_id, :environments, :auth_config)
        ");
        $stmt->execute([
            'name' => $name,
            'description' => !empty($description) ? $description : null,
            'owner_id' => $userId,
            'environments' => $environmentsJson,
            'auth_config' => $authConfigJson
        ]);

        $newProjectId = (int)$pdo->lastInsertId();

        // Also add creator as project_members owner
        $memberStmt = $pdo->prepare("
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (:project_id, :user_id, 'owner')
        ");
        $memberStmt->execute([
            'project_id' => $newProjectId,
            'user_id' => $userId
        ]);

        sendSuccess([
            'project_id' => $newProjectId,
            'name' => $name
        ], 'Project created successfully', 201);
    }
} catch (PDOException $e) {
    error_log('Insert/Update Project Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
