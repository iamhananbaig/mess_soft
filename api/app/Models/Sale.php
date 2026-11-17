<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    protected $fillable = ['user_id', 'total_amount', 'payment_method', 'amount_received', 'change', 'voided_at'];

    protected $casts = ['total_amount' => 'integer', 'amount_received' => 'integer', 'change' => 'integer', 'voided_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function voidRequests(): HasMany
    {
        return $this->hasMany(VoidRequest::class);
    }

    /** Sales that count towards revenue (not voided). */
    public function scopeNotVoided($query)
    {
        return $query->whereNull('voided_at');
    }
}
