package com.messsoft.pos

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PosActivity : BaseActivity() {

    private var categories = listOf<Category>()
    private var menu = listOf<MenuItem>()
    private var selectedCategory = 0 // 0 = All
    private val cart = LinkedHashMap<Int, CartLine>()
    private var methods = listOf(PayMethod("cash", "Cash"))
    private var activeMethod = "cash"
    private var charging = false

    private lateinit var menuAdapter: MenuAdapter
    private lateinit var cartAdapter: CartAdapter

    private lateinit var menuScreen: View
    private lateinit var checkoutScreen: View
    private lateinit var categoriesRow: LinearLayout
    private lateinit var menuMessage: TextView
    private lateinit var cartBar: View
    private lateinit var cartSummary: TextView
    private lateinit var printerStatus: TextView
    private lateinit var totalView: TextView
    private lateinit var methodsRow: LinearLayout
    private lateinit var cashBox: View
    private lateinit var received: EditText
    private lateinit var quickCash: LinearLayout
    private lateinit var changeView: TextView
    private lateinit var reference: EditText
    private lateinit var charge: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        setContentView(R.layout.activity_pos)

        menuScreen = findViewById(R.id.menuScreen)
        checkoutScreen = findViewById(R.id.checkoutScreen)
        categoriesRow = findViewById(R.id.categories)
        menuMessage = findViewById(R.id.menuMessage)
        cartBar = findViewById(R.id.cartBar)
        cartSummary = findViewById(R.id.cartSummary)
        printerStatus = findViewById(R.id.printerStatus)
        totalView = findViewById(R.id.total)
        methodsRow = findViewById(R.id.methods)
        cashBox = findViewById(R.id.cashBox)
        received = findViewById(R.id.received)
        quickCash = findViewById(R.id.quickCash)
        changeView = findViewById(R.id.change)
        reference = findViewById(R.id.reference)
        charge = findViewById(R.id.charge)

        findViewById<TextView>(R.id.subtitle).text = session.userName

        menuAdapter = MenuAdapter()
        findViewById<RecyclerView>(R.id.menuGrid).apply {
            layoutManager = GridLayoutManager(this@PosActivity, 3)
            adapter = menuAdapter
            setHasFixedSize(true)
            itemAnimator = null
        }
        cartAdapter = CartAdapter()
        findViewById<RecyclerView>(R.id.cartList).apply {
            layoutManager = LinearLayoutManager(this@PosActivity)
            adapter = cartAdapter
            itemAnimator = null
        }

        findViewById<Button>(R.id.openCheckout).setOnClickListener { showCheckout(true) }
        findViewById<Button>(R.id.back).setOnClickListener { showCheckout(false) }
        findViewById<Button>(R.id.clearCart).setOnClickListener {
            if (cart.isEmpty()) return@setOnClickListener
            AlertDialog.Builder(this)
                .setMessage("Remove all items from the cart?")
                .setPositiveButton("Clear") { _, _ -> clearCart(); showCheckout(false) }
                .setNegativeButton("Cancel", null)
                .show()
        }
        findViewById<Button>(R.id.more).setOnClickListener { showMoreMenu(it) }
        charge.setOnClickListener { checkout() }
        received.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = updateCheckout()
        })
        menuMessage.setOnClickListener { if (menu.isEmpty()) load() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (checkoutScreen.visibility == View.VISIBLE) showCheckout(false) else moveTaskToBack(true)
            }
        })

        updateCart()
        load()
    }

    override fun onResume() {
        super.onResume()
        if (AppState.menuChanged && ::menuAdapter.isInitialized) {
            AppState.menuChanged = false
            load()
        }
        if (::printerStatus.isInitialized) {
            printerStatus.postDelayed({ printerStatus.text = if (SunmiPrinter.isReady) "" else "No printer" }, 1500)
        }
    }

    // ── Loading ──

    private fun load() {
        showMenuMessage("Loading menu…")
        lifecycleScope.launch {
            // coroutineScope: a failed request is thrown here, into the catch, instead of
            // cancelling the activity's scope and crashing the app (e.g. no Wi-Fi at startup).
            try { coroutineScope {
                // Managers don't have categories:view by default — fall back to the items' own categories.
                val cats = async { runCatching { api.get("/categories") as JSONArray }.getOrNull() }
                val items = async { api.get("/menu") as JSONArray }
                val pos = async { runCatching { api.get("/settings/pos") as JSONObject }.getOrNull() }
                val receipt = async { runCatching { api.get("/settings/receipt") as JSONObject }.getOrNull() }

                val menuJson = items.await()
                categories = cats.await()?.objects()?.map { Category(it.getInt("id"), it.optString("name")) }
                    ?: menuJson.objects().mapNotNull { r -> r.optJSONObject("category")?.let { Category(it.optInt("id"), it.optString("name")) } }
                        .distinctBy { it.id }.sortedBy { it.name.lowercase() }
                setMenu(menuJson)
                pos.await()?.let { applyPosSettings(it) }
                receipt.await()?.let { AppState.receiptSettings = ReceiptSettings.from(it) }
                findViewById<TextView>(R.id.title).text = AppState.receiptSettings.canteenName.ifEmpty { getString(R.string.app_name) }
                buildCategoryChips()
                showMenu()
                checkForUpdates(manual = false)
            } } catch (e: ApiException) {
                if (handleAuth(e)) return@launch
                showMenuMessage("${e.message}\n\nTap to try again.")
            }
        }
    }

    private fun setMenu(json: JSONArray) {
        menu = json.objects().map {
            MenuItem(it.getInt("id"), it.optInt("category_id"), it.optString("name"), it.optInt("price"), it.optBoolean("is_available", true))
        }
        // Drop cart lines whose item was deactivated; keep the latest price/availability.
        val byId = menu.associateBy { it.id }
        val stale = cart.keys.filter { it !in byId }
        stale.forEach { cart.remove(it) }
        cart.values.toList().forEach { line -> byId[line.item.id]?.let { cart[it.id] = CartLine(it, line.quantity) } }
        updateCart()
    }

    private fun refreshMenu() {
        lifecycleScope.launch {
            try { setMenu(api.get("/menu") as JSONArray); showMenu() } catch (_: ApiException) {}
        }
    }

    private fun applyPosSettings(json: JSONObject) {
        val enabled = json.optJSONArray("payment_methods")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: listOf("cash")
        val labels = json.optJSONArray("available_payment_methods").objects().associate { it.optString("key") to it.optString("label") }
        if (labels.isNotEmpty()) AppState.paymentLabels = labels
        methods = enabled.map { PayMethod(it, labels[it] ?: it.replaceFirstChar { c -> c.uppercase() }) }.ifEmpty { listOf(PayMethod("cash", "Cash")) }
        if (methods.none { it.key == activeMethod }) activeMethod = methods.first().key
    }

    // ── Menu ──

    private fun buildCategoryChips() {
        categoriesRow.removeAllViews()
        val all = listOf(Category(0, "All")) + categories.filter { c -> menu.any { it.categoryId == c.id } }
        for (cat in all) {
            val chip = TextView(this).apply {
                text = cat.name
                textSize = 15f
                gravity = Gravity.CENTER
                minHeight = dp(40)
                setPadding(dp(16), 0, dp(16), 0)
                setBackgroundResource(R.drawable.chip)
                isSelected = cat.id == selectedCategory
                setTextColor(if (isSelected) 0xFFFFFFFF.toInt() else getColor(R.color.text))
                setOnClickListener {
                    selectedCategory = cat.id
                    buildCategoryChips()
                    showMenu()
                }
            }
            categoriesRow.addView(chip, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(8) })
        }
    }

    private fun showMenu() {
        val visible = if (selectedCategory == 0) menu else menu.filter { it.categoryId == selectedCategory }
        menuAdapter.submit(visible)
        if (visible.isEmpty()) showMenuMessage("No items on the menu.") else menuMessage.visibility = View.GONE
    }

    private fun showMenuMessage(text: String) {
        menuMessage.text = text
        menuMessage.visibility = View.VISIBLE
    }

    private fun addToCart(item: MenuItem, view: View) {
        if (charging) return
        if (!item.available) {
            toast("${item.name} is out of stock")
            return
        }
        view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        val line = cart[item.id]
        if (line == null) cart[item.id] = CartLine(item, 1) else line.quantity++
        menuAdapter.refresh(item.id)
        updateCart()
    }

    private fun changeQuantity(itemId: Int, delta: Int) {
        val line = cart[itemId] ?: return
        line.quantity += delta
        if (line.quantity <= 0) cart.remove(itemId)
        menuAdapter.refresh(itemId)
        updateCart()
        if (cart.isEmpty()) showCheckout(false)
    }

    private fun clearCart() {
        cart.clear()
        received.setText("")
        reference.setText("")
        menuAdapter.notifyDataSetChanged()
        updateCart()
    }

    private val total get() = cart.values.sumOf { it.amount }
    private val itemCount get() = cart.values.sumOf { it.quantity }

    private fun updateCart() {
        cartBar.visibility = if (cart.isEmpty()) View.GONE else View.VISIBLE
        cartSummary.text = "$itemCount item${if (itemCount == 1) "" else "s"} · ${rs(total)}"
        if (::cartAdapter.isInitialized) cartAdapter.notifyDataSetChanged()
        if (checkoutScreen.visibility == View.VISIBLE) updateCheckout()
    }

    // ── Checkout ──

    private fun showCheckout(show: Boolean) {
        if (show && cart.isEmpty()) return
        checkoutScreen.visibility = if (show) View.VISIBLE else View.GONE
        if (show) {
            buildMethodChips()
            updateCheckout()
        } else {
            hideKeyboard()
        }
    }

    private fun buildMethodChips() {
        methodsRow.removeAllViews()
        for (m in methods) {
            val chip = TextView(this).apply {
                text = m.label
                textSize = 15f
                gravity = Gravity.CENTER
                minHeight = dp(42)
                setPadding(dp(16), 0, dp(16), 0)
                setBackgroundResource(R.drawable.chip)
                isSelected = m.key == activeMethod
                setTextColor(if (isSelected) 0xFFFFFFFF.toInt() else getColor(R.color.text))
                setOnClickListener {
                    activeMethod = m.key
                    buildMethodChips()
                    updateCheckout()
                }
            }
            methodsRow.addView(chip, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(8) })
        }
        methodsRow.visibility = if (methods.size > 1) View.VISIBLE else View.GONE
    }

    private val isCash get() = activeMethod == "cash"
    private val receivedAmount: Int? get() = received.text.toString().toIntOrNull()

    private fun updateCheckout() {
        totalView.text = rs(total)
        cashBox.visibility = if (isCash) View.VISIBLE else View.GONE
        reference.visibility = if (isCash) View.GONE else View.VISIBLE
        if (isCash) {
            buildQuickCash()
            val r = receivedAmount
            changeView.text = when {
                r == null -> ""
                r < total -> "Short by ${rs(total - r)}"
                else -> "Change: ${rs(r - total)}"
            }
            changeView.setTextColor(getColor(if (r != null && r < total) R.color.danger else R.color.primary_dark))
        }
        val label = methods.firstOrNull { it.key == activeMethod }?.label ?: "Cash"
        charge.text = if (charging) "Saving sale…" else "Charge ${rs(total)} · $label"
        charge.isEnabled = !charging && cart.isNotEmpty() && (!isCash || (receivedAmount ?: -1) >= total)
    }

    /** Exact amount plus the next round notes above the total. */
    private fun buildQuickCash() {
        val t = total
        val options = linkedSetOf(t)
        for (step in intArrayOf(100, 500, 1000, 5000)) {
            val up = ((t + step - 1) / step) * step
            if (up > t) options += up
        }
        val amounts = options.take(4)
        val tag = amounts.joinToString(",")
        if (quickCash.tag == tag) return
        quickCash.tag = tag
        quickCash.removeAllViews()
        amounts.forEachIndexed { i, amount ->
            val b = Button(this, null, 0, R.style.SecondaryButton).apply {
                text = if (i == 0) "Exact" else String.format(Locale.US, "%,d", amount)
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, 0)
                setOnClickListener { received.setText(amount.toString()); received.setSelection(received.text.length) }
            }
            quickCash.addView(b, LinearLayout.LayoutParams(0, dp(48), 1f).apply { if (i > 0) marginStart = dp(6) })
        }
    }

    private fun checkout() {
        if (charging || cart.isEmpty()) return
        val amount = receivedAmount
        if (isCash && (amount == null || amount < total)) return toast("Enter the cash received (at least the total)")
        hideKeyboard()
        charging = true
        updateCheckout()

        val body = JSONObject()
            .put("items", JSONArray().apply { cart.values.forEach { put(JSONObject().put("menu_item_id", it.item.id).put("quantity", it.quantity)) } })
            .put("payment_method", activeMethod)
            .put("amount_received", if (isCash) amount else JSONObject.NULL)
            .put("payment_reference", if (isCash) JSONObject.NULL else reference.text.toString().trim().ifEmpty { null } ?: JSONObject.NULL)

        lifecycleScope.launch {
            val sale: JSONObject
            try {
                sale = api.post("/sales", body) as JSONObject
            } catch (e: ApiException) {
                charging = false
                updateCheckout()
                if (handleAuth(e)) return@launch
                // Not saved — the cart stays so the cashier can fix it (e.g. out of stock) and retry.
                AlertDialog.Builder(this@PosActivity).setTitle("Sale not saved").setMessage(e.message).setPositiveButton("OK", null).show()
                refreshMenu()
                return@launch
            }

            val saleId = sale.getInt("id")
            session.lastSaleId = saleId
            val saleTotal = sale.optInt("total_amount")
            val change = if (sale.isNull("change")) null else sale.optInt("change")
            charging = false
            clearCart()
            showCheckout(false)
            refreshMenu()
            printAccountsThenAsk(saleId, saleTotal, change, reprint = false)
        }
    }

    private fun testPrint() {
        lifecycleScope.launch {
            try {
                val now = SimpleDateFormat("dd-MMM-yyyy hh:mm a", Locale.US).format(Date())
                SunmiPrinter.print(this@PosActivity, EscPos.testPage(AppState.receiptSettings.canteenName, session.userName, session.server, now))
                toast("Test page printed")
            } catch (e: Exception) {
                showError("Print failed", e.message)
            }
        }
    }

    // ── Menu (⋮) ──

    private fun showMoreMenu(anchor: View) {
        val popup = PopupMenu(this, anchor)
        val dashboard = if (session.can("reports:view")) popup.menu.add("Dashboard") else null
        val sales = popup.menu.add("Sales")
        sales.isEnabled = session.can("sales:view")
        val voids = if (session.can("sales:void-approve")) popup.menu.add("Void requests") else null
        val manage = if (listOf("menu:create", "menu:edit", "categories:create", "categories:edit").any(session::can))
            popup.menu.add("Manage menu") else null
        val reprint = popup.menu.add("Reprint last receipt")
        reprint.isEnabled = session.lastSaleId > 0
        val refresh = popup.menu.add("Refresh menu")
        val test = popup.menu.add("Test print")
        val update = popup.menu.add("Check for updates (v${Updater.installedVersion(this)})")
        val signOut = popup.menu.add("Sign out")
        popup.setOnMenuItemClickListener { item ->
            when (item) {
                dashboard -> startActivity(Intent(this, DashboardActivity::class.java))
                sales -> startActivity(Intent(this, SalesActivity::class.java))
                voids -> startActivity(Intent(this, VoidsActivity::class.java))
                manage -> startActivity(Intent(this, MenuAdminActivity::class.java))
                reprint -> printAccountsThenAsk(session.lastSaleId, null, null, reprint = true)
                refresh -> load()
                test -> testPrint()
                update -> checkForUpdates(manual = true)
                signOut -> confirmSignOut()
            }
            true
        }
        popup.show()
    }

    private fun confirmSignOut() {
        AlertDialog.Builder(this)
            .setMessage(if (cart.isEmpty()) "Sign out ${session.userName}?" else "Sign out? The current cart will be lost.")
            .setPositiveButton("Sign out") { _, _ ->
                lifecycleScope.launch {
                    runCatching { api.post("/logout", JSONObject()) }
                    session.signOut()
                    goToLogin()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ── Adapters ──

    private inner class MenuAdapter : RecyclerView.Adapter<MenuAdapter.Holder>() {
        private var items = listOf<MenuItem>()

        fun submit(list: List<MenuItem>) { items = list; notifyDataSetChanged() }

        fun refresh(itemId: Int) {
            val i = items.indexOfFirst { it.id == itemId }
            if (i >= 0) notifyItemChanged(i)
        }

        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val name: TextView = v.findViewById(R.id.name)
            val price: TextView = v.findViewById(R.id.price)
            val badge: TextView = v.findViewById(R.id.badge)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_menu, parent, false))

        override fun getItemCount() = items.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val item = items[position]
            val qty = cart[item.id]?.quantity ?: 0
            h.name.text = item.name
            h.price.text = if (item.available) rs(item.price) else "Out of stock"
            h.price.setTextColor(getColor(if (item.available) R.color.primary_dark else R.color.danger))
            h.itemView.alpha = if (item.available) 1f else 0.5f
            h.itemView.isSelected = qty > 0
            h.badge.visibility = if (qty > 0) View.VISIBLE else View.GONE
            h.badge.text = qty.toString()
            h.itemView.setOnClickListener { addToCart(item, it) }
            h.itemView.setOnLongClickListener { if (qty > 0) { changeQuantity(item.id, -1); true } else false }
        }
    }

    private inner class CartAdapter : RecyclerView.Adapter<CartAdapter.Holder>() {
        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val name: TextView = v.findViewById(R.id.name)
            val amount: TextView = v.findViewById(R.id.amount)
            val qty: TextView = v.findViewById(R.id.qty)
            val minus: Button = v.findViewById(R.id.minus)
            val plus: Button = v.findViewById(R.id.plus)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_cart, parent, false))

        override fun getItemCount() = cart.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val line = cart.values.elementAt(position)
            h.name.text = line.item.name
            h.amount.text = "${line.quantity} × ${rs(line.item.price)} = ${rs(line.amount)}"
            h.qty.text = line.quantity.toString()
            h.minus.setOnClickListener { if (!charging) changeQuantity(line.item.id, -1) }
            h.plus.setOnClickListener { if (!charging) changeQuantity(line.item.id, +1) }
        }
    }
}
