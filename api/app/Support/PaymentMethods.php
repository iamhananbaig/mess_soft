<?php

namespace App\Support;

final class PaymentMethods
{
    /** key => label printed on receipts and reports */
    public const LABELS = [
        'cash' => 'Cash',
        'card' => 'Card',
        'jazzcash' => 'JazzCash',
        'easypaisa' => 'Easypaisa',
        'bank_transfer' => 'Bank Transfer',
    ];

    public static function label(?string $method): string
    {
        return self::LABELS[$method] ?? ucfirst((string) $method);
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::LABELS);
    }
}
