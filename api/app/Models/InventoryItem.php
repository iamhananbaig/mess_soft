<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryItem extends Model
{
    protected $fillable = ['name', 'unit', 'current_stock', 'reorder_level', 'avg_cost', 'expiry_date', 'is_active'];

    protected $casts = [
        'current_stock' => 'decimal:2',
        'reorder_level' => 'decimal:2',
        'avg_cost' => 'decimal:4',
        'expiry_date' => 'date',
        'is_active' => 'boolean',
    ];

    public function recipes(): HasMany
    {
        return $this->hasMany(Recipe::class);
    }

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    /**
     * Fold a purchase into the weighted-average cost. Negative/zero stock is
     * treated as zero so a bad count can't produce a negative cost.
     */
    public function averageCostAfterPurchase(float $quantity, float $unitCost): float
    {
        $onHand = max(0.0, (float) $this->current_stock);
        if ($onHand + $quantity <= 0) {
            return $unitCost;
        }

        return round(($onHand * (float) $this->avg_cost + $quantity * $unitCost) / ($onHand + $quantity), 4);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
