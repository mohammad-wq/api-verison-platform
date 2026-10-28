<?php

declare(strict_types=1);

namespace Mohammad\ApiVersionPlatform;

/** Produces one stable representation of a Markdown working copy. */
final class SourceHasher
{
    public static function normalize(string $markdown): string
    {
        $markdown = preg_replace('/^\xEF\xBB\xBF/', '', $markdown) ?? $markdown;
        return str_replace(["\r\n", "\r"], "\n", $markdown);
    }

    public static function hash(string $markdown): string
    {
        return hash('sha256', self::normalize($markdown));
    }
}
