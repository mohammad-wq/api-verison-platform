<?php

declare(strict_types=1);

namespace Mohammad\ApiVersionPlatform;

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
        $env['AVP_SERVER_HOST'] = $host;
        // Lets the UI keep working while the Test APIs tab waits on a slow API. PHP does not support workers on Windows.
        if (PHP_OS_FAMILY !== 'Windows' && !isset($env['PHP_CLI_SERVER_WORKERS'])) {
            $env['PHP_CLI_SERVER_WORKERS'] = '4';
        }
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

    /** Write a starter local-only avp.config.php into $projectRoot. */
    public static function init(string $projectRoot, bool $force = false): string
    {
        $target = rtrim($projectRoot, '/\\') . DIRECTORY_SEPARATOR . Config::FILE_NAME;
        if (is_file($target) && !$force) {
            throw new \RuntimeException("{$target} already exists (use --force to overwrite).");
        }

        $template = file_get_contents(self::packageRoot() . '/config/avp.config.example.php');
        if (file_put_contents($target, $template) === false) {
            throw new \RuntimeException("Could not write {$target}.");
        }
        $stateDir = rtrim($projectRoot, '/\\') . DIRECTORY_SEPARATOR . '.avp';
        if (!is_dir($stateDir) && !mkdir($stateDir, 0777, true) && !is_dir($stateDir)) {
            throw new \RuntimeException("Could not create {$stateDir}.");
        }
        return $target;
    }
}
