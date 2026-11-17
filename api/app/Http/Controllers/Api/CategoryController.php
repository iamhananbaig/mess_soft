<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index(): JsonResponse
    {
        $categories = Category::orderBy('name')->get();

        return response()->json($categories);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:categories,name',
        ]);

        $category = Category::create($validated);
        Activity::log('category.created', "Created category {$category->name}", $category);

        return response()->json($category, 201);
    }

    public function show(Category $category): JsonResponse
    {
        return response()->json($category);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255|unique:categories,name,'.$category->id,
        ]);

        $before = $category->only(array_keys($validated));
        $category->update($validated);
        Activity::log('category.updated', "Updated category {$category->name}", $category, Activity::diff($before, $category->only(array_keys($validated))));

        return response()->json($category);
    }

    public function destroy(Category $category): JsonResponse
    {
        if ($category->menuItems()->count() > 0) {
            return response()->json(['message' => 'Cannot delete category with menu items'], 422);
        }
        $category->delete();
        Activity::log('category.deleted', "Deleted category {$category->name}", $category);

        return response()->json(['message' => 'Category deleted']);
    }
}
