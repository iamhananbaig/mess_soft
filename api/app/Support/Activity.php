<?php

namespace App\Support;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

/**
 * Audit trail for changes that matter to the business (prices, recipes, stock,
 * staff, permissions, settings, voids, closings, sign-ins).
 */
final class Activity
{
    public static function log(string $action, string $description, ?Model $subject = null, array $changes = [], ?int $userId = null): void
    {
        try {
            ActivityLog::create([
                'user_id' => $userId ?? auth()->id(),
                'action' => $action,
                'subject_type' => $subject ? class_basename($subject) : null,
                'subject_id' => $subject?->getKey(),
                'description' => mb_substr($description, 0, 255),
                'changes' => $changes ?: null,
                'ip' => request()?->ip(),
            ]);
        } catch (\Throwable $e) {
            // Never let auditing break the action itself.
            Log::warning('Activity log failed: '.$e->getMessage());
        }
    }

    /**
     * Field-level diff between two attribute arrays: {field: {from, to}}.
     */
    public static function diff(array $before, array $after): array
    {
        $changes = [];
        foreach ($after as $field => $to) {
            $from = $before[$field] ?? null;
            if (self::normalize($from) !== self::normalize($to)) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }

        return $changes;
    }

    private static function normalize(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        if (is_numeric($value)) {
            return rtrim(rtrim(number_format((float) $value, 4, '.', ''), '0'), '.');
        }
        if (is_array($value)) {
            return json_encode($value);
        }

        return $value === null ? null : (string) $value;
    }
}
