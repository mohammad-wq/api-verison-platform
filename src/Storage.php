<?php

declare(strict_types=1);

namespace Mohammad\ApiVersionPlatform;

use PDO;

final class Storage
{
    private const SCHEMA_VERSION = 2;

    private PDO $pdo;

    public function __construct(string $databasePath)
    {
        $directory = dirname($databasePath);
        if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
            throw new \RuntimeException("Could not create storage directory: {$directory}");
        }
        $this->pdo = new PDO('sqlite:' . $databasePath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $this->pdo->exec('PRAGMA foreign_keys = ON');
        $this->migrate();
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    private function migrate(): void
    {
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        $current = (int) ($this->pdo->query("SELECT value FROM metadata WHERE key = 'schema_version'")->fetchColumn() ?: 0);
        if ($current >= self::SCHEMA_VERSION) {
            return;
        }

        $this->pdo->beginTransaction();
        try {
            // v2: versions imported as OpenAPI (from the UI) have no Markdown source, so markdown/source_hash are nullable.
            $this->pdo->exec('CREATE TABLE versions_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL UNIQUE,
                note TEXT,
                markdown TEXT,
                source_hash TEXT,
                openapi_json TEXT NOT NULL,
                openapi_hash TEXT NOT NULL,
                parser_warnings_json TEXT NOT NULL,
                parser_statistics_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )');
            $hasV1 = $this->pdo->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'versions'")->fetchColumn();
            if ($hasV1) {
                $this->pdo->exec('INSERT INTO versions_v2 SELECT id, label, note, markdown, source_hash, openapi_json, openapi_hash, parser_warnings_json, parser_statistics_json, created_at FROM versions');
                $this->pdo->exec('DROP TABLE versions');
            }
            $this->pdo->exec('ALTER TABLE versions_v2 RENAME TO versions');
            $this->pdo->exec('CREATE TABLE IF NOT EXISTS request_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                environment TEXT,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                request_headers TEXT,
                request_body TEXT,
                response_status INTEGER,
                response_headers TEXT,
                response_body TEXT,
                duration_ms INTEGER,
                created_at TEXT NOT NULL
            )');
            $this->pdo->prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (:key, :value)')
                ->execute(['key' => 'schema_version', 'value' => (string) self::SCHEMA_VERSION]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
