<?php
require_once dirname(__DIR__, 2) . '/config.php';
require_once dirname(__DIR__, 2) . '/includes/markdownOpenApiParser.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$auth = requireAuth();
$userId = (int)$auth['id'];
$data = getRequestData();

$versionId = isset($data['id']) ? (int)$data['id'] : (int)($data['version_id'] ?? 0);
$projectId = isset($data['project_id']) ? (int)$data['project_id'] : 0;
$versionName = trim($data['version'] ?? '');
$openapi = $data['openapi'] ?? null;
$markdown = $data['markdown'] ?? null;
$parseResult = null;
$note = trim($data['note'] ?? '');
$isLatest = isset($data['is_latest']) ? (int)filter_var($data['is_latest'], FILTER_VALIDATE_BOOLEAN) : 1;
$isUpdate = $versionId > 0;

foreach (['markdown_file', 'file'] as $uploadField) {
    if (!isset($_FILES[$uploadField])) {
        continue;
    }
    $upload = $_FILES[$uploadField];
    if ($upload['error'] !== UPLOAD_ERR_OK) {
        sendError('Markdown file upload failed with error code ' . $upload['error'], 400);
    }
    if ($upload['size'] > 5 * 1024 * 1024) {
        sendError('Markdown file must not exceed 5 MB', 413);
    }
    $extension = strtolower(pathinfo($upload['name'], PATHINFO_EXTENSION));
    if (!in_array($extension, ['md', 'markdown'], true)) {
        sendError('Uploaded file must use the .md or .markdown extension', 400);
    }
    $fileContents = file_get_contents($upload['tmp_name']);
    if ($fileContents === false) {
        sendError('Unable to read the uploaded Markdown file', 400);
    }
    $markdown = $fileContents;
    break;
}

if ($projectId <= 0) {
    sendError('project_id is required', 400);
}

if (!$isUpdate && empty($versionName)) {
    sendError('version name (e.g. v1.0.0) is required', 400);
}

if ($markdown !== null) {
    if (!is_string($markdown) || trim($markdown) === '') {
        sendError('markdown must be a non-empty string', 400);
    }
    if (strlen($markdown) > 5 * 1024 * 1024) {
        sendError('Markdown content must not exceed 5 MB', 413);
    }
    $parseResult = MarkdownOpenApiParser::parse($markdown);
    if (($parseResult['statistics']['endpoints'] ?? 0) === 0) {
        sendError('No API endpoints were found in the Markdown document', 400, $parseResult);
    }
    $openapi = $parseResult['openapi'];
} elseif ($openapi === null) {
    sendError('openapi specification or markdown is required', 400);
}

// Ensure openapi is valid JSON
if (is_array($openapi) || is_object($openapi)) {
    $openapiJson = json_encode($openapi, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $openapiArray = json_decode($openapiJson, true);
} else {
    $openapiJson = (string)$openapi;
    $openapiArray = json_decode($openapiJson, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendError('Invalid OpenAPI JSON format: ' . json_last_error_msg(), 400);
    }
}

// Calculate content hash for integrity & deduplication
$contentHash = computeOpenApiHash($openapiArray);

try {
    $pdo = getDBConnection();
    checkProjectAccess($pdo, $projectId, $userId, ['owner', 'editor']);

    $pdo->beginTransaction();

    if ($isLatest === 1) {
        $demoteStmt = $pdo->prepare("UPDATE versions SET is_latest = 0 WHERE project_id = :project_id");
        $demoteStmt->execute(['project_id' => $projectId]);
    }

    if ($isUpdate) {
        $stmt = $pdo->prepare("
            UPDATE versions 
            SET openapi = :openapi,
                content_hash = :content_hash,
                author_id = :author_id,
                note = :note,
                is_latest = :is_latest
                " . (!empty($versionName) ? ", version = :version" : "") . "
            WHERE id = :id AND project_id = :project_id AND is_deleted = 0
        ");

        $params = [
            'openapi' => $openapiJson,
            'content_hash' => $contentHash,
            'author_id' => $userId,
            'note' => !empty($note) ? $note : null,
            'is_latest' => $isLatest,
            'id' => $versionId,
            'project_id' => $projectId
        ];
        if (!empty($versionName)) {
            $params['version'] = $versionName;
        }

        $stmt->execute($params);
        $finalVersionId = $versionId;
    } else {
        // Check duplicate version string in this project
        $checkStmt = $pdo->prepare("
            SELECT id FROM versions 
            WHERE project_id = :project_id AND version = :version AND is_deleted = 0
        ");
        $checkStmt->execute(['project_id' => $projectId, 'version' => $versionName]);
        if ($checkStmt->fetch()) {
            $pdo->rollBack();
            sendError("Version '{$versionName}' already exists in this project", 409);
        }

        $stmt = $pdo->prepare("
            INSERT INTO versions (project_id, version, openapi, content_hash, author_id, note, is_latest)
            VALUES (:project_id, :version, :openapi, :content_hash, :author_id, :note, :is_latest)
        ");
        $stmt->execute([
            'project_id' => $projectId,
            'version' => $versionName,
            'openapi' => $openapiJson,
            'content_hash' => $contentHash,
            'author_id' => $userId,
            'note' => !empty($note) ? $note : null,
            'is_latest' => $isLatest
        ]);

        $finalVersionId = (int)$pdo->lastInsertId();
    }

    $pdo->commit();

    $responseData = [
        'id' => $finalVersionId,
        'project_id' => $projectId,
        'version' => $versionName,
        'content_hash' => $contentHash,
        'is_latest' => (bool)$isLatest
    ];
    if ($parseResult !== null) {
        $responseData['parse'] = [
            'warnings' => $parseResult['warnings'],
            'statistics' => $parseResult['statistics'],
        ];
    }
    sendSuccess($responseData, $isUpdate ? 'Version updated successfully' : 'Version created successfully', $isUpdate ? 200 : 201);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Insert/Update Version Error: ' . $e->getMessage());
    sendError(formatSqlError($e), getSqlErrorStatusCode($e));
}
?>
