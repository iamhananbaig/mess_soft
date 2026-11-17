<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MenuItem;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MenuItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = MenuItem::with('category')
            ->with('recipes.inventoryItem')
            ->when($request->category_id, fn ($q, $catId) => $q->where('category_id', $catId))
            ->active()
            ->orderBy('name')
            ->get()
            ->map(fn ($item) => array_merge($item->toArray(), [
                'is_available' => $item->recipes->isEmpty() || $item->recipes->every(
                    fn ($r) => $r->inventoryItem && $r->inventoryItem->current_stock >= $r->quantity
                ),
                ...self::costing($item),
            ]));

        return response()->json($items);
    }

    /**
     * Food cost of one portion at current average ingredient costs, and the margin.
     */
    private static function costing(MenuItem $item): array
    {
        $cost = round($item->recipes->sum(fn ($r) => (float) $r->quantity * (float) ($r->inventoryItem?->avg_cost ?? 0)), 2);

        return [
            'food_cost' => $cost,
            'margin' => $item->price > 0 ? round(($item->price - $cost) / $item->price * 100, 1) : null,
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'required|exists:categories,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'price' => 'required|integer|min:0',
            'image' => 'nullable|string|max:255',
        ]);

        $item = MenuItem::create($validated);
        Activity::log('menu.created', "Created menu item {$item->name} at Rs.{$item->price}", $item);

        return response()->json($item->load('category'), 201);
    }

    public function show(MenuItem $menu): JsonResponse
    {
        $menu->load(['category', 'recipes.inventoryItem']);

        return response()->json(array_merge($menu->toArray(), [
            'category' => $menu->category,
            'recipes' => $menu->recipes,
            ...self::costing($menu),
        ]));
    }

    public function update(Request $request, MenuItem $menu): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'sometimes|exists:categories,id',
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'price' => 'sometimes|integer|min:0',
            'image' => 'nullable|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        $before = $menu->only(array_keys($validated));
        $menu->update($validated);
        Activity::log('menu.updated', "Updated menu item {$menu->name}", $menu, Activity::diff($before, $menu->only(array_keys($validated))));
        $menu->load('category');

        return response()->json(array_merge($menu->toArray(), [
            'category' => $menu->category,
        ]));
    }

    public function destroy(MenuItem $menu): JsonResponse
    {
        $menu->update(['is_active' => false]);
        Activity::log('menu.deactivated', "Deactivated menu item {$menu->name}", $menu);

        return response()->json(['message' => 'Menu item deactivated']);
    }
}
