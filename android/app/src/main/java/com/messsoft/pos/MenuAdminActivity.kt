package com.messsoft.pos

import android.app.AlertDialog
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.DividerItemDecoration
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

    private lateinit var summary: TextView
    private lateinit var message: TextView
    private lateinit var filters: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        setContentView(R.layout.activity_list)
        findViewById<TextView>(R.id.title).text = "Manage menu"
        summary = findViewById(R.id.summary)
        message = findViewById(R.id.message)
        filters = findViewById(R.id.filters)
        findViewById<Button>(R.id.back).setOnClickListener { finish() }
        message.setOnClickListener { load() }

        findViewById<Button>(R.id.action).apply {
            if (canCreateCategory) {
                text = "+ Category"
                setOnClickListener { editCategory(null) }
            } else {
                setOnClickListener { load() }
            }
        }
        if (canCreateItem) {
            findViewById<View>(R.id.bottomBar).visibility = View.VISIBLE
            findViewById<Button>(R.id.bottomButton).apply {
                text = "+ Add menu item"
                setOnClickListener { editItem(null) }
            }
        }
        findViewById<RecyclerView>(R.id.list).apply {
            layoutManager = LinearLayoutManager(this@MenuAdminActivity)
            adapter = this@MenuAdminActivity.adapter
            addItemDecoration(DividerItemDecoration(this@MenuAdminActivity, DividerItemDecoration.VERTICAL))
            itemAnimator = null
        }
        load()
    }

    private fun load() {
        message.text = "Loading…"
        message.visibility = View.VISIBLE
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
                show()
            } } catch (e: ApiException) {
                if (handleAuth(e)) return@launch
                message.text = "${e.message}\n\nTap to try again."
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
        val visible = if (selected == 0) items else items.filter { it.categoryId == selected }
        adapter.submit(visible)
        summary.text = "${visible.size} item${if (visible.size == 1) "" else "s"}" + if (canEditCategory) " · long-press a category to rename" else ""
        if (visible.isEmpty()) {
            message.text = if (canCreateItem) "No items here yet.\n\nTap “+ Add menu item” below." else "No items here."
            message.visibility = View.VISIBLE
        } else {
            message.visibility = View.GONE
        }
    }

    private fun changed() {
        AppState.menuChanged = true
        load()
    }

    // ── Categories ──

    private fun editCategory(category: Category?) {
        val box = dialogBox()
        box.addView(heading(if (category == null) "New category" else "Rename category"))
        val name = field("Category name", InputType.TYPE_TEXT_FLAG_CAP_WORDS, 255).apply { setText(category?.name.orEmpty()) }
        box.addView(name)
        val dialog = AlertDialog.Builder(this).setView(box).create()
        val save = addDialogButton(box, dialog, if (category == null) "Add category" else "Save", primary = true) {}
        addDialogButton(box, dialog, "Cancel", primary = false) { hideKeyboard() }
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
                    dialog.dismiss()
                    changed()
                } catch (e: ApiException) {
                    if (handleAuth(e)) return@launch
                    save.isEnabled = true
                    name.error = e.message
                }
            }
        }
        dialog.show()
        name.requestFocus()
    }

    // ── Items ──

    private fun editItem(item: Item?) {
        if (categories.isEmpty()) {
            showError("No categories", if (canCreateCategory) "Add a category first (+ Category)." else "Ask an admin to add a category first.")
            return
        }
        val box = dialogBox()
        box.addView(heading(if (item == null) "New menu item" else "Edit menu item"))

        box.addView(label("Name"))
        val name = field("e.g. Chicken Burger", InputType.TYPE_TEXT_FLAG_CAP_WORDS, 255).apply { setText(item?.name.orEmpty()) }
        box.addView(name)

        box.addView(label("Price (Rs.)"))
        val price = field("e.g. 350", 0, 9).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            setText(item?.price?.toString().orEmpty())
        }
        box.addView(price)

        box.addView(label("Category"))
        val spinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@MenuAdminActivity, android.R.layout.simple_spinner_dropdown_item, categories.map { it.name })
            val pre = item?.categoryId ?: selected
            setSelection(categories.indexOfFirst { it.id == pre }.coerceAtLeast(0))
            setBackgroundResource(R.drawable.field)
            setPadding(dp(4), 0, dp(4), 0)
        }
        box.addView(spinner, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)))

        box.addView(label("Description (optional)"))
        val description = field("", InputType.TYPE_TEXT_FLAG_CAP_SENTENCES, 1000).apply { setText(item?.description.orEmpty()) }
        box.addView(description)

        var active: CheckBox? = null
        if (item != null) {
            active = CheckBox(this).apply {
                text = "Active (shown on the POS)"
                textSize = 16f
                isChecked = true
                setPadding(0, dp(8), 0, dp(4))
            }
            box.addView(active)
            if (item.foodCost > 0) {
                box.addView(TextView(this).apply {
                    text = "Food cost ${rs(Math.round(item.foodCost).toInt())} per portion (recipes are edited on the web)"
                    textSize = 13f
                    setTextColor(getColor(R.color.muted))
                })
            }
        }

        val scroll = ScrollView(this).apply { addView(box) }
        val dialog = AlertDialog.Builder(this).setView(scroll).create()
        val save = addDialogButton(box, dialog, if (item == null) "Add item" else "Save", primary = true) {}
        addDialogButton(box, dialog, "Cancel", primary = false) { hideKeyboard() }

        save.setOnClickListener {
            val n = name.text.toString().trim()
            val p = price.text.toString().toIntOrNull()
            when {
                n.isEmpty() -> { name.error = "Enter a name"; return@setOnClickListener }
                p == null -> { price.error = "Enter the price in rupees"; return@setOnClickListener }
            }
            val categoryId = categories[spinner.selectedItemPosition].id
            val body = JSONObject()
                .put("name", n)
                .put("price", p)
                .put("category_id", categoryId)
                .put("description", description.text.toString().trim().ifEmpty { null } ?: JSONObject.NULL)

            fun submit() {
                save.isEnabled = false
                lifecycleScope.launch {
                    try {
                        if (item == null) {
                            api.post("/menu", body)
                            toast("“$n” added to the menu")
                        } else {
                            active?.let { body.put("is_active", it.isChecked) }
                            api.put("/menu/${item.id}", body)
                            toast(if (active?.isChecked == false) "“$n” deactivated" else "“$n” saved")
                        }
                        hideKeyboard()
                        dialog.dismiss()
                        changed()
                    } catch (e: ApiException) {
                        if (handleAuth(e)) return@launch
                        save.isEnabled = true
                        showError("Not saved", e.message)
                    }
                }
            }

            if (active?.isChecked == false) {
                AlertDialog.Builder(this)
                    .setTitle("Deactivate “$n”?")
                    .setMessage("It disappears from the POS and this list. Past sales keep it. To bring it back, use the web app's Menu page.")
                    .setPositiveButton("Deactivate") { _, _ -> submit() }
                    .setNegativeButton("Cancel", null)
                    .show()
            } else {
                submit()
            }
        }
        dialog.show()
        if (item == null) name.requestFocus()
    }

    private fun heading(text: String) = TextView(this).apply {
        this.text = text
        textSize = 20f
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, 0, 0, dp(6))
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        textSize = 14f
        setTextColor(getColor(R.color.muted))
        setPadding(0, dp(10), 0, dp(4))
    }

    private fun field(hint: String, flags: Int, max: Int) = EditText(this).apply {
        this.hint = hint
        textSize = 17f
        inputType = InputType.TYPE_CLASS_TEXT or flags
        isSingleLine = true
        filters = arrayOf(InputFilter.LengthFilter(max))
        setBackgroundResource(R.drawable.field)
        setPadding(dp(12), 0, dp(12), 0)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52))
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
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_sale, parent, false))

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
            h.itemView.isClickable = canEditItem
            h.itemView.setOnClickListener(if (canEditItem) View.OnClickListener { editItem(item) } else null)
        }
    }
}
