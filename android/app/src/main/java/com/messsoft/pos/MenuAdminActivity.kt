package com.messsoft.pos

import android.content.res.ColorStateList
import android.os.Bundle
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * Add and edit menu items and categories. Each action follows the user's permissions
 * (menu:create, menu:edit, categories:create, categories:edit).
 *
 * The API lists active items only, so a deactivated item drops off this list and can
 * be reactivated from the web app's Menu page.
 */
class MenuAdminActivity : BaseActivity() {

    private data class Item(
        val id: Int,
        val categoryId: Int,
        val name: String,
        val price: Int,
        val description: String,
        val available: Boolean,
        val foodCost: Double,
    )

    private val adapter = ItemsAdapter()
    private var categories = listOf<Category>()
    private var items = listOf<Item>()
    private var selected = 0 // 0 = all

    private val canCreateItem by lazy { session.can("menu:create") }
    private val canEditItem by lazy { session.can("menu:edit") }
    private val canCreateCategory by lazy { session.can("categories:create") }
    private val canEditCategory by lazy { session.can("categories:edit") }

    private lateinit var state: StateView
    private lateinit var filters: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        setContentView(R.layout.activity_list)
        topBar("Menu")
        state = StateView(window.decorView)
        filters = findViewById(R.id.filters)
        if (canCreateCategory) {
            findViewById<LinearLayout>(R.id.actions).addView(Button(this).apply {
                text = "New category"
                textSize = 15f
                isAllCaps = false
                stateListAnimator = null
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(getColor(R.color.primary))
                setBackgroundResource(R.drawable.ripple_row)
                setPadding(dp(12), 0, dp(12), 0)
                setOnClickListener { editCategory(null) }
            }, lp(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)))
        } else {
            addTopAction(R.drawable.ic_refresh, "Refresh") { load() }
        }
        if (canCreateItem) {
            findViewById<View>(R.id.bottomBar).visibility = View.VISIBLE
            findViewById<Button>(R.id.bottomButton).apply {
                text = "Add a menu item"
                setOnClickListener { editItem(null) }
            }
        }
        findViewById<RecyclerView>(R.id.list).apply {
            layoutManager = LinearLayoutManager(this@MenuAdminActivity)
            adapter = this@MenuAdminActivity.adapter
            itemAnimator = null
        }
        load()
    }

    private fun load() {
        if (items.isEmpty()) state.loading("Loading the menu…") else busy(true)
        lifecycleScope.launch {
            try { coroutineScope {
                val cats = async { if (session.can("categories:view")) runCatching { api.get("/categories") as JSONArray }.getOrNull() else null }
                val menu = api.get("/menu") as JSONArray
                val rows = menu.objects()
                items = rows.map {
                    Item(it.optInt("id"), it.optInt("category_id"), it.optString("name"), it.optInt("price"),
                        it.optStringOrNull("description").orEmpty(), it.optBoolean("is_available", true), it.optDouble("food_cost", 0.0))
                }
                // Without categories:view, fall back to the categories the items belong to.
                categories = (cats.await()?.objects()?.map { Category(it.optInt("id"), it.optString("name")) }
                    ?: rows.mapNotNull { r -> r.optJSONObject("category")?.let { Category(it.optInt("id"), it.optString("name")) } }.distinctBy { it.id })
                    .sortedBy { it.name.lowercase() }
                busy(false)
                show()
            } } catch (e: ApiException) {
                busy(false)
                if (handleAuth(e)) return@launch
                if (items.isEmpty()) state.error(e) { load() } else showError("Couldn't refresh", e.message)
            }
        }
    }

    private fun show() {
        if (selected != 0 && categories.none { it.id == selected }) selected = 0
        findViewById<View>(R.id.filtersScroll).visibility = View.VISIBLE
        filters.removeAllViews()
        filters.addView(chip("All", selected == 0) { selected = 0; show() })
        for (c in categories) {
            filters.addView(chip(c.name, selected == c.id) { selected = c.id; show() }.apply {
                if (canEditCategory) setOnLongClickListener { editCategory(c); true }
            })
        }
        val current = categories.firstOrNull { it.id == selected }
        if (current != null && canEditCategory) {
            filters.addView(TextView(this).apply {
                text = "Rename"
                textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(getColor(R.color.primary))
                setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_edit, 0, 0, 0)
                compoundDrawableTintList = ColorStateList.valueOf(getColor(R.color.primary))
                compoundDrawablePadding = dp(6)
                gravity = android.view.Gravity.CENTER_VERTICAL
                minHeight = dp(38)
                setPadding(dp(10), 0, dp(10), 0)
                setBackgroundResource(R.drawable.ripple_row)
                setOnClickListener { editCategory(current) }
            })
        }
        val visible = if (selected == 0) items else items.filter { it.categoryId == selected }
        adapter.submit(visible)
        val count = "${visible.size} item${if (visible.size == 1) "" else "s"}"
        topSummary(if (current == null) "$count on the menu" else "$count in ${current.name}")
        if (visible.isEmpty()) {
            state.empty(R.drawable.ic_restaurant_menu, "No items here yet",
                if (canCreateItem) "Add one with the button below." else null)
        } else {
            state.hide()
        }
    }

    private fun changed() {
        AppState.menuChanged = true
        load()
    }

    // ── Categories ──

    private fun editCategory(category: Category?) {
        val sheet = Sheet(this).title(if (category == null) "New category" else "Rename “${category.name}”")
        sheet.body.addView(label("Name"))
        val name = field("e.g. Drinks", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS).apply { setText(category?.name.orEmpty()) }
        sheet.body.addView(name)
        val save = sheet.button(if (category == null) "Add category" else "Save name", keepOpen = true)
        sheet.button("Cancel", ButtonKind.SECONDARY) { hideKeyboard() }
        save.setOnClickListener {
            val value = name.text.toString().trim()
            if (value.isEmpty()) { name.error = "Enter a name"; return@setOnClickListener }
            save.isEnabled = false
            lifecycleScope.launch {
                try {
                    val body = JSONObject().put("name", value)
                    if (category == null) {
                        val created = api.post("/categories", body) as JSONObject
                        selected = created.optInt("id")
                        toast("Category “$value” added")
                    } else {
                        api.put("/categories/${category.id}", body)
                        toast("Category renamed")
                    }
                    hideKeyboard()
                    sheet.dismiss()
                    changed()
                } catch (e: ApiException) {
                    if (handleAuth(e)) return@launch
                    save.isEnabled = true
                    name.error = e.message
                }
            }
        }
        sheet.show()
        name.requestFocus()
    }

    // ── Items ──

    private fun editItem(item: Item?) {
        if (categories.isEmpty()) {
            showError("No categories yet", if (canCreateCategory) "Add a category first with “New category”." else "Ask an admin to add a category first.")
            return
        }
        val sheet = Sheet(this).title(if (item == null) "New menu item" else "Edit “${item.name}”")
        val body = sheet.body

        body.addView(label("Name"))
        val name = field("e.g. Chicken Burger", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS).apply { setText(item?.name.orEmpty()) }
        body.addView(name)

        body.addView(label("Price in rupees"))
        val price = field("e.g. 350", InputType.TYPE_CLASS_NUMBER, 9).apply {
            setText(item?.price?.toString().orEmpty())
            fontFeatureSettings = "tnum"
        }
        body.addView(price)

        body.addView(label("Category"))
        var categoryId = item?.categoryId ?: selected.takeIf { it != 0 } ?: categories.first().id
        val pills = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun buildPills() {
            pills.removeAllViews()
            for (c in categories) pills.addView(chip(c.name, c.id == categoryId) { categoryId = c.id; buildPills() })
        }
        buildPills()
        body.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(pills) })

        body.addView(label("Description (optional)"))
        val description = field("Shown on the web menu", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES, 1000)
            .apply { setText(item?.description.orEmpty()) }
        body.addView(description)

        var active: CheckBox? = null
        if (item != null) {
            active = CheckBox(this).apply {
                text = "On the menu (shown on the POS)"
                textSize = 16f
                isChecked = true
                buttonTintList = ColorStateList.valueOf(getColor(R.color.primary))
                setPadding(dp(4), dp(10), 0, dp(10))
            }
            body.addView(active, lp().apply { topMargin = dp(10) })
            if (item.foodCost > 0) {
                body.addView(text("Food cost ${rs(Math.round(item.foodCost).toInt())} per portion. Recipes are edited on the web.", 13f, R.color.muted))
            }
        }

        val save = sheet.button(if (item == null) "Add to the menu" else "Save changes", keepOpen = true)
        sheet.button("Cancel", ButtonKind.SECONDARY) { hideKeyboard() }

        save.setOnClickListener {
            val n = name.text.toString().trim()
            val p = price.text.toString().toIntOrNull()
            when {
                n.isEmpty() -> { name.error = "Enter a name"; return@setOnClickListener }
                p == null -> { price.error = "Enter the price in rupees"; return@setOnClickListener }
            }
            val json = JSONObject()
                .put("name", n)
                .put("price", p)
                .put("category_id", categoryId)
                .put("description", description.text.toString().trim().ifEmpty { null } ?: JSONObject.NULL)

            fun submit() {
                save.isEnabled = false
                lifecycleScope.launch {
                    try {
                        if (item == null) {
                            api.post("/menu", json)
                            toast("“$n” added to the menu")
                        } else {
                            active?.let { json.put("is_active", it.isChecked) }
                            api.put("/menu/${item.id}", json)
                            toast(if (active?.isChecked == false) "“$n” taken off the menu" else "“$n” saved")
                        }
                        hideKeyboard()
                        sheet.dismiss()
                        changed()
                    } catch (e: ApiException) {
                        if (handleAuth(e)) return@launch
                        save.isEnabled = true
                        showError("Not saved", e.message)
                    }
                }
            }

            if (active?.isChecked == false) {
                confirm("Take “$n” off the menu?",
                    "It disappears from the POS and this list. Past sales keep it. To bring it back, use the web app's Menu page.",
                    "Take it off", danger = true) { submit() }
            } else {
                submit()
            }
        }
        sheet.show()
        if (item == null) name.requestFocus()
    }

    // ── List ──

    private inner class ItemsAdapter : RecyclerView.Adapter<ItemsAdapter.Holder>() {
        private var rows = listOf<Item>()

        fun submit(list: List<Item>) { rows = list; notifyDataSetChanged() }

        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val title: TextView = v.findViewById(R.id.title)
            val sub: TextView = v.findViewById(R.id.items)
            val amount: TextView = v.findViewById(R.id.amount)
            val status: TextView = v.findViewById(R.id.status)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_sale, parent, false).also { Fonts.apply(it) })

        override fun getItemCount() = rows.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val item = rows[position]
            h.title.text = item.name
            h.sub.text = categories.firstOrNull { it.id == item.categoryId }?.name.orEmpty() +
                (if (item.description.isNotEmpty()) " · ${item.description}" else "")
            h.amount.text = rs(item.price)
            h.status.visibility = if (item.available) View.GONE else View.VISIBLE
            h.status.text = "Out of stock"
            h.status.setTextColor(getColor(R.color.danger))
            h.status.backgroundTintList = ColorStateList.valueOf(getColor(R.color.danger_soft))
            h.itemView.isClickable = canEditItem
            h.itemView.setOnClickListener(if (canEditItem) View.OnClickListener { editItem(item) } else null)
        }
    }
}
