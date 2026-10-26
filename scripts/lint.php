<?php

/** Syntax-check every PHP file in the package (php -l). */

declare(strict_types=1);

$root = dirname(__DIR__);
$files = [$root . '/bin/avp-serve'];
foreach (['src', 'backend', 'backend-overrides', 'config', 'scripts'] as $dir) {
    if (!is_dir("{$root}/{$dir}")) {
        continue;
    }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("{$root}/{$dir}", FilesystemIterator::SKIP_DOTS));
    foreach ($items as $item) {
        if ($item->getExtension() === 'php') {
            $files[] = $item->getPathname();
        }
    }
}

$failed = 0;
foreach ($files as $file) {
    exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($file) . ' 2>&1', $output, $code);
    if ($code !== 0) {
        $failed++;
        fwrite(STDERR, implode("\n", $output) . "\n");
    }
    $output = [];
}

fwrite(STDOUT, count($files) . " files checked, {$failed} failed\n");
exit($failed ? 1 : 0);
