<?php

declare(strict_types=1);

namespace Dawatkhi\ApiVersionPlatform;

/**
 * Resolves package configuration.
 *
 * Precedence (lowest to highest): built-in defaults, the project's avp.config.php, AVP_* environment variables.
 * This file is also required directly by the router and backend bootstrap, so it must not depend on the autoloader.
 */
final class Config
{
    public const FILE_NAME = 'avp.config.php';

    /** Env var the CLI uses to hand the resolved config file path to the server process. */
    public const FILE_ENV = 'AVP_CONFIG_FILE';

    private const DEFAULTS = [
        'db' => [
            'host' => '127.0.0.1',
            'port' => 3306,
            'name' => 'api_versioning',
            'user' => 'root',
            'pass' => '',
            'charset' => 'utf8mb4',
        ],
        'jwt' => [
            'secret' => '',
            'expiration' => 604800, // 7 days
        ],
        'server' => [
            'host' => '127.0.0.1',
            'port' => 8080,
        ],
    ];

    private const ENV_MAP = [
        'AVP_DB_HOST' => ['db', 'host'],
        'AVP_DB_PORT' => ['db', 'port'],
        'AVP_DB_NAME' => ['db', 'name'],
        'AVP_DB_USER' => ['db', 'user'],
        'AVP_DB_PASS' => ['db', 'pass'],
        'AVP_DB_CHARSET' => ['db', 'charset'],
        'AVP_JWT_SECRET' => ['jwt', 'secret'],
        'AVP_JWT_EXPIRATION' => ['jwt', 'expiration'],
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

        $config['db']['port'] = (int) $config['db']['port'];
        $config['jwt']['expiration'] = (int) $config['jwt']['expiration'];
        $config['server']['port'] = (int) $config['server']['port'];

        return $config;
    }

    /** Find avp.config.php in the given project root, if present. */
    public static function locate(string $projectRoot): ?string
    {
        $path = rtrim($projectRoot, '/\\') . DIRECTORY_SEPARATOR . self::FILE_NAME;
        return is_file($path) ? $path : null;
    }

    /** @return list<string> Problems that prevent the backend from working */
    public static function validate(array $config): array
    {
        $errors = [];
        if (strlen((string) $config['jwt']['secret']) < 32) {
            $errors[] = 'jwt.secret must be at least 32 characters (run `avp-serve init` to generate one).';
        }
        if ($config['db']['name'] === '' || $config['db']['user'] === '') {
            $errors[] = 'db.name and db.user are required.';
        }
        return $errors;
    }
}
