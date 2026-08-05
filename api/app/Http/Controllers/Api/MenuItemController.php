<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MenuItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MenuItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = MenuItem::with('category')
            ->with('recipes.inventoryItem')
            ->when($request->category_id, fn($q, $catId) => $q->where('category_id', $catId))
            ->active()
            ->orderBy('name')
            ->get()
            ->map(fn($item) => array_merge($item->toArray(), [
                'is_available' => $item->recipes->isEmpty() || $item->recipes->every(
                    fn($r) => $r->inventoryItem && $r->inventoryItem->current_stock >= $r->quantity
                ),
            ]));

        return response()->json($items);
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
        return response()->json($item->load('category'), 201);
    }

    public function show(MenuItem $menu): JsonResponse
    {
        $menu->load(['category', 'recipes.inventoryItem']);
        return response()->json(array_merge($menu->toArray(), [
            'category' => $menu->category,
            'recipes' => $menu->recipes,
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

        $menu->update($validated);
        $menu->load('category');
        return response()->json(array_merge($menu->toArray(), [
            'category' => $menu->category,
        ]));
    }

    public function destroy(MenuItem $menu): JsonResponse
    {
        $menu->update(['is_active' => false]);
        return response()->json(['message' => 'Menu item deactivated']);
    }
}
