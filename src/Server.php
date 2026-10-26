<?php

declare(strict_types=1);

namespace Dawatkhi\ApiVersionPlatform;

/** Launches PHP's built-in server with the package router and bundled UI. */
final class Server
{
    public static function packageRoot(): string
    {
        return dirname(__DIR__);
    }

    /**
     * Run the server in the foreground; returns its exit code.
     *
     * @param string|null $configFile Passed to the server process via AVP_CONFIG_FILE
     */
    public static function run(string $host, int $port, ?string $configFile): int
    {
        $root = self::packageRoot();
        $command = [
            PHP_BINARY,
            '-S', "{$host}:{$port}",
            '-t', $root . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'ui',
            $root . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'router.php',
        ];

        $env = getenv();
        if ($configFile !== null) {
            $env[Config::FILE_ENV] = $configFile;
        }

        $process = proc_open($command, [STDIN, STDOUT, STDERR], $pipes, null, $env);
        if (!is_resource($process)) {
            fwrite(STDERR, "Failed to start the PHP built-in server.\n");
            return 1;
        }

        return proc_close($process);
    }

    /** Write a starter avp.config.php into $projectRoot with a random JWT secret. */
    public static function init(string $projectRoot, bool $force = false): string
    {
        $target = rtrim($projectRoot, '/\\') . DIRECTORY_SEPARATOR . Config::FILE_NAME;
        if (is_file($target) && !$force) {
            throw new \RuntimeException("{$target} already exists (use --force to overwrite).");
        }

        $template = file_get_contents(self::packageRoot() . '/config/avp.config.example.php');
        $contents = str_replace('change-me-to-a-random-64-char-string', bin2hex(random_bytes(32)), $template);

        if (file_put_contents($target, $contents) === false) {
            throw new \RuntimeException("Could not write {$target}.");
        }
        return $target;
    }
}
