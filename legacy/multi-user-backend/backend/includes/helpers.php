<?php
if (basename($_SERVER['PHP_SELF']) === basename(__FILE__)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'statusCode' => 403,
        'message' => 'Access denied. This resource is protected and cannot be accessed directly.',
        'data' => null,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT);
    exit;
}

/**
 * Retrieve incoming request data from multipart/form-data, php://input JSON, or $_POST / $_GET
 * 
 * @return array
 */
function getRequestData(): array
{
    // If multipart/form-data or standard POST was submitted
    if (!empty($_POST)) {
        return $_POST;
    }

    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $json = json_decode($rawInput, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
            return $json;
        }
    }

    return $_GET;
}

/**
 * Check if a user has access to a project and retrieve the member role
 * 
 * @param PDO $pdo
 * @param int $projectId
 * @param int $userId
 * @param array $allowedRoles Defaults to ['owner', 'editor', 'viewer']
 * @return array Project row and user role
 */
function checkProjectAccess(PDO $pdo, int $projectId, int $userId, array $allowedRoles = ['owner', 'editor', 'viewer']): array
{
    $projStmt = $pdo->prepare("SELECT * FROM projects WHERE id = :id AND is_deleted = 0");
    $projStmt->execute(['id' => $projectId]);
    $project = $projStmt->fetch();

    if (!$project) {
        sendError('Project not found', 404);
    }

    if ((int)$project['owner_id'] === $userId) {
        $project['user_role'] = 'owner';
        return $project;
    }

    $memberStmt = $pdo->prepare("
        SELECT role 
        FROM project_members 
        WHERE project_id = :project_id AND user_id = :user_id AND is_deleted = 0
    ");
    $memberStmt->execute(['project_id' => $projectId, 'user_id' => $userId]);
    $role = $memberStmt->fetchColumn();

    if (!$role) {
        sendError('You do not have permission to access this project', 403);
    }

    if (!in_array($role, $allowedRoles, true)) {
        sendError("Permission denied. Required role: " . implode('/', $allowedRoles), 403);
    }

    $project['user_role'] = $role;
    return $project;
}

/**
 * Compute SHA256 content hash of normalized OpenAPI content
 * 
 * @param mixed $openapiData
 * @return string
 */
function computeOpenApiHash($openapiData): string
{
    if (is_string($openapiData)) {
        $decoded = json_decode($openapiData, true);
        if ($decoded !== null) {
            $openapiData = $decoded;
        }
    }

    if (is_array($openapiData)) {
        $sortRecursive = function (&$arr) use (&$sortRecursive) {
            if (!is_array($arr)) return;
            $isAssoc = array_keys($arr) !== range(0, count($arr) - 1);
            if ($isAssoc) {
                ksort($arr);
            }
            foreach ($arr as &$value) {
                if (is_array($value)) {
                    $sortRecursive($value);
                }
            }
        };
        $sortRecursive($openapiData);
        return hash('sha256', json_encode($openapiData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    return hash('sha256', (string)$openapiData);
}

/**
 * Process avatar upload: validates image (.jpg, .jpeg, .png, .webp),
 * converts to WebP, encrypts/hashes the filename, and saves to uploads/users/
 * 
 * @param array|null $file $_FILES['avatar']
 * @return string|null Relative URL path to save in database (e.g. 'uploads/users/hash.webp')
 */
function processAvatarUpload(?array $file): ?string
{
    if (!$file || !isset($file['error']) || $file['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    if ($file['error'] !== UPLOAD_ERR_OK) {
        sendError('Failed to upload avatar image file', 400);
    }

    if ($file['size'] > 5 * 1024 * 1024) {
        sendError('Avatar image must not exceed 5MB', 400);
    }

    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    if (!in_array($extension, $allowedExtensions, true)) {
        sendError('Invalid image format. Only JPG, JPEG, PNG, and WebP are allowed', 400);
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $allowedMimes = ['image/jpeg', 'image/pjpeg', 'image/png', 'image/webp'];
    if (!in_array($mimeType, $allowedMimes, true)) {
        sendError('Invalid image format. Only JPG, JPEG, PNG, and WebP are allowed', 400);
    }

    $imgInfo = @getimagesize($file['tmp_name']);
    if (!$imgInfo) {
        sendError('Invalid or corrupted image file', 400);
    }

    $srcImage = null;
    switch ($mimeType) {
        case 'image/jpeg':
        case 'image/pjpeg':
            $srcImage = @imagecreatefromjpeg($file['tmp_name']);
            break;
        case 'image/png':
            $srcImage = @imagecreatefrompng($file['tmp_name']);
            if ($srcImage) {
                imagepalettetotruecolor($srcImage);
                imagealphablending($srcImage, true);
                imagesavealpha($srcImage, true);
            }
            break;
        case 'image/webp':
            $srcImage = @imagecreatefromwebp($file['tmp_name']);
            if ($srcImage) {
                imagepalettetotruecolor($srcImage);
                imagealphablending($srcImage, true);
                imagesavealpha($srcImage, true);
            }
            break;
    }

    if (!$srcImage) {
        sendError('Failed to process image file', 400);
    }

    $projectRoot = dirname(__DIR__);
    $uploadDir = $projectRoot . '/uploads/users';
    if (!file_exists($uploadDir)) {
        if (!mkdir($uploadDir, 0777, true) && !is_dir($uploadDir)) {
            imagedestroy($srcImage);
            sendError('Failed to create upload directory', 500);
        }
    }

    // Encrypted cryptographically hashed unique filename
    $encryptedFileName = hash('sha256', bin2hex(random_bytes(16)) . microtime(true) . $file['name']) . '.webp';
    $targetPath = $uploadDir . '/' . $encryptedFileName;

    // Convert and write as WebP with 85 quality
    $saved = @imagewebp($srcImage, $targetPath, 85);
    imagedestroy($srcImage);

    if (!$saved) {
        sendError('Failed to convert and save avatar as WebP', 500);
    }

    return 'uploads/users/' . $encryptedFileName;
}
