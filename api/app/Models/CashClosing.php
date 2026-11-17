<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashClosing extends Model
{
    protected $fillable = [
        'date', 'user_id', 'sales_count', 'gross_amount', 'voided_count', 'voided_amount',
        'expected_cash', 'counted_cash', 'variance', 'note', 'closed_by',
    ];

    protected $casts = [
        'date' => 'date:Y-m-d',
        'sales_count' => 'integer',
        'gross_amount' => 'integer',
        'voided_count' => 'integer',
        'voided_amount' => 'integer',
        'expected_cash' => 'integer',
        'counted_cash' => 'integer',
        'variance' => 'integer',
    ];

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
