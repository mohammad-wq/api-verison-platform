<?php

declare(strict_types=1);

namespace Mohammad\ApiVersionPlatform;

/**
 * Resolves package configuration.
 *
 * Precedence (lowest to highest): built-in defaults, avp.config.php, AVP_* environment variables.
 */
final class Config
{
    public const FILE_NAME = 'avp.config.php';

    /** Env var the CLI uses to hand the resolved config file path to the server process. */
    public const FILE_ENV = 'AVP_CONFIG_FILE';

    private const DEFAULTS = [
        'paths' => [
            'readme' => 'README.md',
            'storage' => '.avp/storage.sqlite',
        ],
        'server' => [
            'host' => '127.0.0.1',
            'port' => 8080,
        ],
    ];

    private const ENV_MAP = [
        'AVP_README_PATH' => ['paths', 'readme'],
        'AVP_STORAGE_PATH' => ['paths', 'storage'],
        'AVP_HOST' => ['server', 'host'],
        'AVP_PORT' => ['server', 'port'],
    ];

    /**
     * @param string|null $file Explicit config file; falls back to the AVP_CONFIG_FILE env var
     * @return array<string, array<string, mixed>>
     */
    public static function load(?string $file = null): array
    {
        $config = self::DEFAULTS;

        $file ??= getenv(self::FILE_ENV) ?: null;
        if ($file !== null) {
            if (!is_file($file)) {
                throw new \RuntimeException("Config file not found: {$file}");
            }
            $fromFile = require $file;
            if (!is_array($fromFile)) {
                throw new \RuntimeException("Config file must return an array: {$file}");
            }
            $config = array_replace_recursive($config, $fromFile);
        }

        foreach (self::ENV_MAP as $env => [$section, $key]) {
            $value = getenv($env);
            if ($value !== false && $value !== '') {
                $config[$section][$key] = $value;
            }
        }

        $config['server']['port'] = (int) $config['server']['port'];

        return $config;
    }

    /** Find avp.config.php in the given project root, if present. */
    public static function locate(string $projectRoot): ?string
    {
        $path = rtrim($projectRoot, '/\\') . DIRECTORY_SEPARATOR . self::FILE_NAME;
        return is_file($path) ? $path : null;
    }

    /** @return list<string> Problems that prevent the local tool from working */
    public static function validate(array $config): array
    {
        $errors = [];
        if (trim((string) $config['paths']['readme']) === '') {
            $errors[] = 'paths.readme is required.';
        }
        if (trim((string) $config['paths']['storage']) === '') {
            $errors[] = 'paths.storage is required.';
        }
        return $errors;
    }
}
