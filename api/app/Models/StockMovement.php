<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $fillable = ['inventory_item_id', 'type', 'source', 'quantity', 'reference', 'note', 'user_id'];
    protected $casts = ['quantity' => 'decimal:2'];

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeInPeriod(Builder $query, string $from, string $to): Builder
    {
        return $query->whereBetween('created_at', [$from, $to . ' 23:59:59']);
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }

    public function scopeOfSource(Builder $query, string $source): Builder
    {
        return $query->where('source', $source);
    }
}
