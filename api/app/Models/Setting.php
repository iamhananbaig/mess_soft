<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['key', 'value'];

    protected $casts = ['value' => 'array'];

    public static function getValue(string $key, array $default = []): array
    {
        return static::where('key', $key)->value('value') ?? $default;
    }

    public static function setValue(string $key, array $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    /**
     * POS options. Only cash is enabled until an admin turns other methods on.
     */
    public static function pos(): array
    {
        $defaults = ['payment_methods' => ['cash']];
        $value = array_merge($defaults, array_intersect_key(static::getValue('pos'), $defaults));
        // Never allow an empty list: cash always works.
        $value['payment_methods'] = array_values(array_unique($value['payment_methods'] ?: ['cash']));

        return $value;
    }

    /**
     * Receipt layout, with defaults that reproduce the slip as printed before
     * settings existed.
     */
    public static function receipt(): array
    {
        $defaults = [
            'canteen_name' => config('app.receipt.canteen_name'),
            'branch_name' => config('app.receipt.branch_name'),
            'show_branch' => false,
            'header_lines' => '',
            'footer_text' => 'Thank you for visiting!',
            'show_cashier' => true,
            'show_payment' => true,
            // The canteen's Speed-X BT600M is an 80mm printer.
            'paper_width' => '80',
            // 'large' = Font A, easier to read; 'compact' = Font B, fits more per line.
            'text_size' => 'large',
            // 80mm printable width in mm (8 dots/mm). 64 is safe on every head; the
            // BT600M crashed at 72, so it is tuned up from here with test prints.
            'print_width_mm' => 64,
            'tear_feed_lines' => 4,
        ];

        return array_merge($defaults, array_intersect_key(static::getValue('receipt'), $defaults));
    }
}
