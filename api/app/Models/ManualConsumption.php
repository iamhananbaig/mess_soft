<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ManualConsumption extends Model
{
    protected $fillable = ['inventory_item_id', 'quantity', 'reason', 'user_id'];
    protected $casts = ['quantity' => 'decimal:2'];

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
