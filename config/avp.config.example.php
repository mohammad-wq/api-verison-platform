<?php

/**
 * API Version Platform configuration.
 *
 * Copy to your project root as avp.config.php (or run `vendor/bin/avp-serve init`).
 * Keep it out of version control if you customise it for a project.
 * Paths are relative to this file. Environment overrides: AVP_README_PATH,
 * AVP_STORAGE_PATH, AVP_HOST and AVP_PORT.
 */

return [
    'paths' => [
        'readme' => 'README.md',
        'storage' => '.avp/storage.sqlite',
    ],
    'server' => [
        'host' => '127.0.0.1',
        'port' => 8080,
    ],
];
