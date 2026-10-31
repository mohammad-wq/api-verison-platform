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

        // Probe the port before announcing anything. A TCP connect is the authoritative check:
        // a bind probe alone can "succeed" on Windows even when another listener owns the port,
        // and a blocked/excluded port fails at bind time inside the child server.
        $peer = @fsockopen($host, $port, $errNo, $errStr, 0.5);
        if (is_resource($peer)) {
            fclose($peer);
            // Windows can also "connect" to addresses inside an excluded port range and only
            // deny the bind; re-checking the bind keeps the refusal message truthful.
            $listener = @stream_socket_server("tcp://{$host}:{$port}", $errNo, $errStr);
            if ($listener !== false) {
                fclose($listener);
                fwrite(STDERR, "Port {$port} is already in use on {$host}. Stop the other server or use a different port.\n");
                return 1;
            }
            fwrite(STDERR, "Could not bind {$host}:{$port} — {$errStr} (port in use, or blocked/excluded on Windows?). Try a different port.\n");
            return 1;
        }
        $probe = @stream_socket_server("tcp://{$host}:{$port}", $errNo, $errStr);
        if ($probe === false) {
            fwrite(STDERR, "Could not bind {$host}:{$port} — {$errStr} (port in use, or blocked/excluded on Windows?). Try a different port.\n");
            return 1;
        }
        fclose($probe);

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

        echo "API Version Platform running at http://{$host}:{$port}\n";

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
