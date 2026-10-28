<?php

/**
 * Copy the local UI build into this package.
 *
 *   --ui=<path>       Vite package build (client/dist-package, from `npm run build:package`) -> resources/ui
 *
 * Usage: php scripts/sync.php --ui=client/dist-package
 */

declare(strict_types=1);

$packageRoot = dirname(__DIR__);

function step(string $message): void
{
    fwrite(STDOUT, "==> {$message}\n");
}

function fail(string $message): never
{
    fwrite(STDERR, "{$message}\n");
    exit(1);
}

function removeTree(string $path): void
{
    if (!file_exists($path)) {
        return;
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($path);
}

/** @param list<string> $excludes Top-level entries of $from to skip */
function copyTree(string $from, string $to, array $excludes = []): int
{
    $count = 0;
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($items as $item) {
        $relative = substr($item->getPathname(), strlen($from) + 1);
        $top = strtok(str_replace('\\', '/', $relative), '/');
        if (in_array($top, $excludes, true)) {
            continue;
        }
        $target = $to . DIRECTORY_SEPARATOR . $relative;
        if ($item->isDir()) {
            is_dir($target) || mkdir($target, 0777, true);
        } else {
            is_dir(dirname($target)) || mkdir(dirname($target), 0777, true);
            copy($item->getPathname(), $target);
            $count++;
        }
    }
    return $count;
}

$options = getopt('', ['ui:']);
if (!$options) {
    fail("Usage: php scripts/sync.php --ui=<path to client/dist-package>");
}

if (isset($options['ui'])) {
    $ui = realpath($options['ui']) ?: fail("UI path not found: {$options['ui']}");
    if (!is_file($ui . '/index.html')) {
        fail("{$ui} has no index.html. Point --ui at the package build (client/dist-package), after `npm run build:package`.");
    }
    // An absolute asset base (e.g. base: '/app/') would make the UI 404 when served by avp-serve.
    if (preg_match('/(?:src|href)="\/(?!\/)/', file_get_contents($ui . '/index.html'))) {
        fail("{$ui}/index.html uses absolute asset paths. Build with Vite `base: './'`.");
    }

    step("Copying {$ui} -> resources/ui");
    removeTree($packageRoot . '/resources/ui');
    $count = copyTree($ui, $packageRoot . '/resources/ui', ['.htaccess']); // Apache-only; the built-in server ignores it
    step("{$count} UI files copied");
}
