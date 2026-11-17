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
            'paper_width' => '58',
            'tear_feed_lines' => 4,
        ];

        return array_merge($defaults, array_intersect_key(static::getValue('receipt'), $defaults));
    }
}
