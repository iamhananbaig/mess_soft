<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RecipeController extends Controller
{
    public function index(MenuItem $menuItem): JsonResponse
    {
        $recipes = Recipe::with('inventoryItem')
            ->where('menu_item_id', $menuItem->id)
            ->get();

        return response()->json($recipes);
    }

    public function store(Request $request, MenuItem $menuItem): JsonResponse
    {
        $validated = $request->validate([
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'quantity' => 'required|numeric|min:0.01',
        ]);

        $exists = Recipe::where('menu_item_id', $menuItem->id)
            ->where('inventory_item_id', $validated['inventory_item_id'])
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'Ingredient already in recipe'], 422);
        }

        $recipe = Recipe::create([
            'menu_item_id' => $menuItem->id,
            'inventory_item_id' => $validated['inventory_item_id'],
            'quantity' => $validated['quantity'],
        ]);

        $recipe->load('inventoryItem');
        Activity::log('recipe.added', "{$menuItem->name}: added {$recipe->quantity} {$recipe->inventoryItem->unit} {$recipe->inventoryItem->name}", $menuItem);

        return response()->json($recipe, 201);
    }

    public function update(Request $request, Recipe $recipe): JsonResponse
    {
        $validated = $request->validate([
            'quantity' => 'required|numeric|min:0.01',
        ]);

        $before = $recipe->only(['quantity']);
        $recipe->update($validated);
        $recipe->load(['inventoryItem', 'menuItem']);
        Activity::log('recipe.updated', "{$recipe->menuItem->name}: {$recipe->inventoryItem->name} quantity changed", $recipe->menuItem, Activity::diff($before, $recipe->only(['quantity'])));

        return response()->json($recipe->load('inventoryItem'));
    }

    public function destroy(Recipe $recipe): JsonResponse
    {
        $recipe->load(['inventoryItem', 'menuItem']);
        $recipe->delete();
        Activity::log('recipe.removed', "{$recipe->menuItem->name}: removed {$recipe->inventoryItem->name}", $recipe->menuItem);

        return response()->json(['message' => 'Ingredient removed from recipe']);
    }
}
