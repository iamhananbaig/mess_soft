<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $fillable = ['inventory_item_id', 'type', 'source', 'quantity', 'unit_cost', 'reference', 'note', 'user_id'];

    protected $casts = ['quantity' => 'decimal:2', 'unit_cost' => 'decimal:4'];

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
