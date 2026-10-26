<?php
require_once dirname(__DIR__, 2) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$projectId = isset($data['project_id']) ? (int)$data['project_id'] : 0;
$environment = trim($data['environment'] ?? '');
$label = trim($data['label'] ?? '');
$expiresInDays = isset($data['expires_in_days']) ? (int)$data['expires_in_days'] : 30;

if ($projectId <= 0) {
    sendError('project_id is required', 400);
}

if ($expiresInDays <= 0) {
    $expiresInDays = 30;
}

$expiresAt = date('Y-m-d H:i:s', strtotime("+{$expiresInDays} days"));

// Generate cryptographically secure token
$token = bin2hex(random_bytes(24));

try {
    $pdo = getDBConnection();
    checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor']);

    $stmt = $pdo->prepare("
        INSERT INTO share_links (project_id, created_by_id, token, environment, label, expires_at)
        VALUES (:project_id, :created_by_id, :token, :environment, :label, :expires_at)
    ");
    $stmt->execute([
        'project_id' => $projectId,
        'created_by_id' => $userId,
        'token' => $token,
        'environment' => !empty($environment) ? $environment : null,
        'label' => !empty($label) ? $label : 'Public Share Link',
        'expires_at' => $expiresAt
    ]);

    $shareId = (int)$pdo->lastInsertId();

    sendSuccess([
        'id' => $shareId,
        'project_id' => $projectId,
        'token' => $token,
        'environment' => $environment,
        'label' => $label,
        'expires_at' => $expiresAt
    ], 'Share link generated successfully', 201);
} catch (PDOException $e) {
    error_log('Generate Share Link Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
