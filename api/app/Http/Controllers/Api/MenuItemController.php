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
            ->when($request->category_id, fn($q, $catId) => $q->where('category_id', $catId))
            ->active()
            ->orderBy('name')
            ->get();

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

    public function show(MenuItem $menuItem): JsonResponse
    {
        return response()->json($menuItem->load(['category', 'recipes.inventoryItem']));
    }

    public function update(Request $request, MenuItem $menuItem): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'sometimes|exists:categories,id',
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'price' => 'sometimes|integer|min:0',
            'image' => 'nullable|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        $menuItem->update($validated);
        return response()->json($menuItem->load('category'));
    }

    public function destroy(MenuItem $menuItem): JsonResponse
    {
        $menuItem->update(['is_active' => false]);
        return response()->json(['message' => 'Menu item deactivated']);
    }
}
