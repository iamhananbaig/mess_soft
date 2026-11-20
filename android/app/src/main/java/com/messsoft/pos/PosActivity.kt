package com.messsoft.pos

import android.content.Intent
import android.content.res.ColorStateList
import android.os.Bundle
import android.text.Editable
import android.text.TextUtils
import android.text.TextWatcher
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
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
    private var query = ""
    private val cart = LinkedHashMap<Int, CartLine>()
    private var methods = listOf(PayMethod("cash", "Cash"))
    private var activeMethod = "cash"
    private var charging = false
    private var pendingVoids = 0

    private lateinit var menuAdapter: MenuAdapter
    private lateinit var state: StateView

    private lateinit var categoriesRow: LinearLayout
    private lateinit var searchRow: View
    private lateinit var search: EditText
    private lateinit var tabsScroll: View
    private lateinit var ticketCount: TextView
    private lateinit var ticketTotal: TextView
    private lateinit var openCheckout: Button
    private lateinit var printerPill: TextView
    private lateinit var moreBadge: TextView

    private lateinit var checkoutScreen: View
    private lateinit var checkoutSheet: View
    private lateinit var scrim: View
    private lateinit var cartRows: LinearLayout
    private lateinit var totalView: TextView
    private lateinit var methodsLabel: View
    private lateinit var methodsBox: LinearLayout
    private lateinit var cashBox: View
    private lateinit var received: EditText
    private lateinit var quickCash: LinearLayout
    private lateinit var changeRow: View
    private lateinit var changeLabel: TextView
    private lateinit var changeView: TextView
    private lateinit var referenceBox: View
    private lateinit var reference: EditText
    private lateinit var charge: Button

    private lateinit var doneScreen: View

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        setContentView(R.layout.activity_pos)

        topBar(getString(R.string.app_name), back = false)
        topSummary(session.userName)
        state = StateView(window.decorView)
        categoriesRow = findViewById(R.id.categories)
        searchRow = findViewById(R.id.searchRow)
        search = findViewById(R.id.search)
        tabsScroll = findViewById(R.id.tabsScroll)
        ticketCount = findViewById(R.id.ticketCount)
        ticketTotal = findViewById(R.id.ticketTotal)
        openCheckout = findViewById(R.id.openCheckout)
        checkoutScreen = findViewById(R.id.checkoutScreen)
        checkoutSheet = findViewById(R.id.checkoutSheet)
        scrim = findViewById(R.id.scrim)
        cartRows = findViewById(R.id.cartRows)
        totalView = findViewById(R.id.total)
        methodsLabel = findViewById(R.id.methodsLabel)
        methodsBox = findViewById(R.id.methods)
        cashBox = findViewById(R.id.cashBox)
        received = findViewById(R.id.received)
        quickCash = findViewById(R.id.quickCash)
        changeRow = findViewById(R.id.changeRow)
        changeLabel = findViewById(R.id.changeLabel)
        changeView = findViewById(R.id.change)
        referenceBox = findViewById(R.id.referenceBox)
        reference = findViewById(R.id.reference)
        charge = findViewById(R.id.charge)
        doneScreen = findViewById(R.id.doneScreen)

        buildTopActions()

        menuAdapter = MenuAdapter()
        findViewById<RecyclerView>(R.id.menuGrid).apply {
            layoutManager = GridLayoutManager(this@PosActivity, 3)
            adapter = menuAdapter
            setHasFixedSize(true)
            itemAnimator = null
        }

        openCheckout.setOnClickListener { showCheckout(true) }
        findViewById<View>(R.id.ticket).setOnClickListener { showCheckout(true) }
        scrim.setOnClickListener { showCheckout(false) }
        findViewById<Button>(R.id.clearCart).setOnClickListener {
            confirm("Clear the order?", "All ${count(itemCount, "item")} will be removed.", "Clear order", danger = true) {
                clearCart()
                showCheckout(false)
            }
        }
        charge.setOnClickListener { checkout() }
        received.addTextChangedListener(watcher { updateCheckout() })
        search.addTextChangedListener(watcher { query = search.text.toString().trim(); showMenu() })
        findViewById<Button>(R.id.newSale).setOnClickListener { closeDone() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    doneScreen.visibility == View.VISIBLE -> closeDone()
                    checkoutScreen.visibility == View.VISIBLE -> showCheckout(false)
                    searchRow.visibility == View.VISIBLE -> toggleSearch(false)
                    else -> moveTaskToBack(true)
                }
            }
        })

        updateCart()
        load()
    }

    override fun onResume() {
        super.onResume()
        if (!::menuAdapter.isInitialized) return
        if (AppState.menuChanged) {
            AppState.menuChanged = false
            load()
        }
        printerPill.postDelayed({ printerPill.visibility = if (SunmiPrinter.isReady) View.GONE else View.VISIBLE }, 1500)
        refreshPendingVoids()
    }

    // ── Top bar ──

    private fun buildTopActions() {
        val actions = findViewById<LinearLayout>(R.id.actions)
        printerPill = statusPill("No printer", R.color.warning, R.color.warning_soft).apply {
            visibility = View.GONE
            setOnClickListener { showError("Printer not connected", "The built-in printer service isn't responding. Sales still save; reprint them later from Sales.") }
        }
        actions.addView(printerPill, lp(ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(4) })
        addTopAction(R.drawable.ic_search, "Search the menu") { toggleSearch(searchRow.visibility != View.VISIBLE) }
        val more = addTopAction(R.drawable.ic_menu, "More") { showMoreSheet() }
        moreBadge = text("", 11f, R.color.surface, bold = true).apply {
            gravity = Gravity.CENTER
            minWidth = dp(20)
            setPadding(dp(5), 0, dp(5), 0)
            setBackgroundResource(R.drawable.dot_badge)
            visibility = View.GONE
        }
        more.addView(moreBadge, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(20), Gravity.TOP or Gravity.END).apply { topMargin = dp(4); marginEnd = dp(2) })
    }

    private fun toggleSearch(show: Boolean) {
        searchRow.visibility = if (show) View.VISIBLE else View.GONE
        tabsScroll.visibility = if (show) View.GONE else View.VISIBLE
        if (show) {
            search.requestFocus()
            getSystemService(android.view.inputmethod.InputMethodManager::class.java).showSoftInput(search, 0)
        } else {
            search.setText("")
            hideKeyboard()
        }
    }

    /** Approvers see how many void requests wait for them on the ☰ button. */
    private fun refreshPendingVoids() {
        if (!session.can("sales:void-approve")) return
        lifecycleScope.launch {
            val json = runCatching { api.get("/void-requests?status=pending&per_page=1") as JSONObject }.getOrNull() ?: return@launch
            pendingVoids = json.optInt("total")
            moreBadge.text = pendingVoids.toString()
            moreBadge.visibility = if (pendingVoids > 0) View.VISIBLE else View.GONE
        }
    }

    // ── Loading ──

    private fun load() {
        if (menu.isEmpty()) state.loading("Loading the menu…") else busy(true)
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
                buildCategoryTabs()
                showMenu()
                busy(false)
                checkForUpdates(manual = false)
            } } catch (e: ApiException) {
                busy(false)
                if (handleAuth(e)) return@launch
                if (menu.isEmpty()) state.error(e) { load() } else toast(e.message ?: "Couldn't refresh the menu")
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

    private fun buildCategoryTabs() {
        categoriesRow.removeAllViews()
        val all = listOf(Category(0, "All")) + categories.filter { c -> menu.any { it.categoryId == c.id } }
        if (all.none { it.id == selectedCategory }) selectedCategory = 0
        for (cat in all) {
            val tab = TextView(this).apply {
                text = cat.name
                textSize = 15f
                gravity = Gravity.CENTER
                setPadding(dp(14), 0, dp(14), 0)
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(getColorStateList(R.color.tab_text))
                setBackgroundResource(R.drawable.tab_indicator)
                isSelected = cat.id == selectedCategory
                setOnClickListener {
                    selectedCategory = cat.id
                    for (i in 0 until categoriesRow.childCount) categoriesRow.getChildAt(i).isSelected = categoriesRow.getChildAt(i) === this
                    showMenu()
                }
            }
            categoriesRow.addView(tab, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
    }

    private fun showMenu() {
        val visible = when {
            query.isNotEmpty() -> menu.filter { it.name.contains(query, ignoreCase = true) }
            selectedCategory == 0 -> menu
            else -> menu.filter { it.categoryId == selectedCategory }
        }
        menuAdapter.submit(visible)
        when {
            visible.isNotEmpty() -> state.hide()
            query.isNotEmpty() -> state.empty(R.drawable.ic_search, "Nothing called “$query”", "Check the spelling, or clear the search to see everything.")
            else -> state.empty(R.drawable.ic_restaurant_menu, "The menu is empty",
                "Add dishes in Manage menu, or on the web app's Menu page.", "Refresh") { load() }
        }
    }

    private fun addToCart(item: MenuItem, view: View) {
        if (charging) return
        if (!item.available) {
            toast("${item.name} is out of stock")
            return
        }
        view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        view.animate().cancel()
        view.scaleX = 0.94f
        view.scaleY = 0.94f
        view.animate().scaleX(1f).scaleY(1f).setDuration(140).setInterpolator(DecelerateInterpolator()).start()
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
        if (cart.isEmpty()) {
            ticketCount.text = "New order"
            ticketTotal.text = "Tap a dish to add it"
            ticketTotal.textSize = 17f
            openCheckout.visibility = View.GONE
        } else {
            ticketCount.text = count(itemCount, "item")
            ticketTotal.text = rs(total)
            ticketTotal.textSize = 26f
            openCheckout.visibility = View.VISIBLE
        }
        // Re-mark as bold so Fonts picks the cut for the new size (SemiBold hint, ExtraBold total).
        ticketTotal.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        if (checkoutScreen.visibility == View.VISIBLE) {
            buildCartRows()
            updateCheckout()
        }
    }

    // ── Checkout ──

    private fun showCheckout(show: Boolean) {
        if (show && cart.isEmpty()) return
        if (show == (checkoutScreen.visibility == View.VISIBLE)) return
        if (show) {
            checkoutScreen.visibility = View.VISIBLE
            buildCartRows()
            buildMethods()
            updateCheckout()
            findViewById<ScrollView>(R.id.checkoutScroll).scrollTo(0, 0)
            scrim.alpha = 0f
            scrim.animate().alpha(1f).setDuration(200).start()
            checkoutSheet.post {
                checkoutSheet.translationY = checkoutSheet.height.toFloat()
                checkoutSheet.animate().translationY(0f).setDuration(220).setInterpolator(DecelerateInterpolator(2f)).start()
            }
        } else {
            hideKeyboard()
            scrim.animate().alpha(0f).setDuration(160).start()
            checkoutSheet.animate().translationY(checkoutSheet.height.toFloat()).setDuration(180)
                .withEndAction { checkoutScreen.visibility = View.GONE }.start()
        }
    }

    private fun buildCartRows() {
        cartRows.removeAllViews()
        cart.values.forEachIndexed { i, line ->
            val row = LayoutInflater.from(this).inflate(R.layout.item_cart, cartRows, false)
            if (i > 0) row.setBackgroundResource(R.drawable.divider)
            row.findViewById<TextView>(R.id.name).text = line.item.name
            row.findViewById<TextView>(R.id.amount).text = rs(line.amount)
            row.findViewById<TextView>(R.id.unit).text = "${rs(line.item.price)} each"
            row.findViewById<TextView>(R.id.qty).text = line.quantity.toString()
            row.findViewById<ImageButton>(R.id.minus).setOnClickListener { if (!charging) changeQuantity(line.item.id, -1) }
            row.findViewById<ImageButton>(R.id.plus).setOnClickListener { if (!charging) changeQuantity(line.item.id, +1) }
            cartRows.addView(row)
        }
        findViewById<TextView>(R.id.orderTitle).text = "Order · ${count(itemCount, "item")}"
    }

    /** Payment methods as equal-width buttons, up to three per row. */
    private fun buildMethods() {
        methodsBox.removeAllViews()
        val single = methods.size <= 1
        methodsLabel.visibility = if (single) View.GONE else View.VISIBLE
        methodsBox.visibility = if (single) View.GONE else View.VISIBLE
        if (single) return
        methods.chunked(3).forEachIndexed { r, rowMethods ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            rowMethods.forEachIndexed { i, m ->
                row.addView(TextView(this).apply {
                    text = m.label
                    textSize = 15f
                    gravity = Gravity.CENTER
                    isSingleLine = true
                    ellipsize = TextUtils.TruncateAt.END
                    setPadding(dp(6), 0, dp(6), 0)
                    setTypeface(typeface, android.graphics.Typeface.BOLD)
                    setBackgroundResource(R.drawable.segment)
                    setTextColor(getColorStateList(R.color.segment_text))
                    isSelected = m.key == activeMethod
                    setOnClickListener {
                        activeMethod = m.key
                        buildMethods()
                        updateCheckout()
                    }
                }, lp(0, dp(48), 1f).apply { if (i > 0) marginStart = dp(8) })
            }
            // Keep a short last row the same width per button as the full ones.
            repeat(3 - rowMethods.size) { if (methods.size > 3) row.addView(View(this), lp(0, dp(48), 1f).apply { marginStart = dp(8) }) }
            methodsBox.addView(row, lp().apply { if (r > 0) topMargin = dp(8) })
        }
    }

    private val isCash get() = activeMethod == "cash"
    private val receivedAmount: Int? get() = received.text.toString().toIntOrNull()
    private val methodLabel get() = methods.firstOrNull { it.key == activeMethod }?.label ?: "Cash"

    private fun updateCheckout() {
        totalView.text = rs(total)
        cashBox.visibility = if (isCash) View.VISIBLE else View.GONE
        referenceBox.visibility = if (isCash) View.GONE else View.VISIBLE
        val r = receivedAmount
        if (isCash) {
            buildQuickCash()
            changeRow.visibility = if (r == null) View.GONE else View.VISIBLE
            if (r != null) {
                val short = r < total
                changeLabel.text = if (short) "Short by" else "Change due"
                changeView.text = rs(if (short) total - r else r - total)
                val color = getColor(if (short) R.color.danger else R.color.success)
                changeLabel.setTextColor(color)
                changeView.setTextColor(color)
                changeRow.backgroundTintList = ColorStateList.valueOf(getColor(if (short) R.color.danger_soft else R.color.success_soft))
            }
        }
        val ready = !isCash || (r ?: -1) >= total
        charge.text = when {
            charging -> "Saving sale…"
            !ready -> "Enter the cash received"
            isCash -> "Charge ${rs(total)}"
            else -> "Charge ${rs(total)} · $methodLabel"
        }
        charge.isEnabled = !charging && cart.isNotEmpty() && ready
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
            val b = button(if (i == 0) "Exact" else String.format(Locale.US, "%,d", amount), ButtonKind.SECONDARY) {
                received.setText(amount.toString())
                received.setSelection(received.text.length)
                hideKeyboard()
            }.apply { setPadding(0, 0, 0, 0); textSize = 15f }
            quickCash.addView(b, lp(0, dp(46), 1f).apply { if (i > 0) marginStart = dp(8) })
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
        val method = methodLabel

        lifecycleScope.launch {
            val sale: JSONObject
            try {
                sale = api.post("/sales", body) as JSONObject
            } catch (e: ApiException) {
                charging = false
                updateCheckout()
                if (handleAuth(e)) return@launch
                // Not saved — the cart stays so the cashier can fix it (e.g. out of stock) and retry.
                showError("Sale not saved", "${e.message}\n\nThe order is still here; fix it and charge again.")
                refreshMenu()
                return@launch
            }

            val saleId = sale.getInt("id")
            session.lastSaleId = saleId
            charging = false
            showDone(saleId, sale.optInt("total_amount"), if (sale.isNull("change")) null else sale.optInt("change"), amount, method)
            clearCart()
            checkoutScreen.visibility = View.GONE
            refreshMenu()
        }
    }

    // ── Sale complete ──

    private fun showDone(saleId: Int, saleTotal: Int, change: Int?, cashReceived: Int?, method: String) {
        findViewById<TextView>(R.id.doneSub).text = "Invoice #${saleId.toString().padStart(6, '0')} · $method"
        val label = findViewById<TextView>(R.id.doneAmountLabel)
        val amount = findViewById<TextView>(R.id.doneAmount)
        val detail = findViewById<TextView>(R.id.doneDetail)
        if (change != null) {
            label.text = "Change due"
            amount.text = rs(change)
            detail.text = "Total ${rs(saleTotal)} · received ${rs(cashReceived ?: saleTotal + change)}"
        } else {
            label.text = "Paid by $method"
            amount.text = rs(saleTotal)
            detail.text = ""
        }
        detail.visibility = if (detail.text.isEmpty()) View.GONE else View.VISIBLE
        val copies = findViewById<LinearLayout>(R.id.doneCopies)
        copies.removeAllViews()
        ReceiptCopies(saleId, reprint = false, container = copies)
        doneScreen.alpha = 0f
        doneScreen.visibility = View.VISIBLE
        doneScreen.animate().alpha(1f).setDuration(180).start()
    }

    private fun closeDone() {
        doneScreen.animate().alpha(0f).setDuration(150).withEndAction { doneScreen.visibility = View.GONE }.start()
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

    // ── More (☰) ──

    private fun showMoreSheet() {
        val sheet = Sheet(this)
        val body = sheet.body
        // Who is signed in.
        body.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text(initials(session.userName), 17f, R.color.primary, bold = true).apply {
                gravity = Gravity.CENTER
                setBackgroundResource(R.drawable.icon_circle)
                backgroundTintList = ColorStateList.valueOf(getColor(R.color.primary_soft))
            }, lp(dp(44), dp(44)).apply { marginEnd = dp(14) })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                addView(text(session.userName, 17f, bold = true))
                addView(text("${session.server.removePrefix("https://").removePrefix("http://")} · version ${Updater.installedVersion(this@PosActivity)}", 13f, R.color.muted))
            }, lp(0, weight = 1f))
        }, lp().apply { bottomMargin = dp(6) })

        fun go(cls: Class<*>) { sheet.dismiss(); startActivity(Intent(this, cls)) }
        fun section(title: String) = body.addView(label(title))

        section("Sales")
        body.addView(menuRow(R.drawable.ic_receipt_long, "Sales and day-end", enabled = session.can("sales:view")) { go(SalesActivity::class.java) })
        body.addView(menuRow(R.drawable.ic_print, "Reprint last receipt",
            detail = if (session.lastSaleId > 0) "#${session.lastSaleId}" else null, enabled = session.lastSaleId > 0) {
            sheet.dismiss(); reprint(session.lastSaleId)
        })

        val canManage = listOf("menu:create", "menu:edit", "categories:create", "categories:edit").any(session::can)
        val approver = session.can("sales:void-approve")
        if (session.can("reports:view") || approver || canManage) {
            section("Manage")
            if (session.can("reports:view")) body.addView(menuRow(R.drawable.ic_bar_chart, "Dashboard") { go(DashboardActivity::class.java) })
            if (approver) body.addView(menuRow(R.drawable.ic_block, "Void requests", badge = pendingVoids) { go(VoidsActivity::class.java) })
            if (canManage) body.addView(menuRow(R.drawable.ic_restaurant_menu, "Menu items and categories") { go(MenuAdminActivity::class.java) })
        }

        section("This device")
        body.addView(menuRow(R.drawable.ic_refresh, "Reload the menu") { sheet.dismiss(); load() })
        body.addView(menuRow(R.drawable.ic_print, "Print a test page",
            detail = if (SunmiPrinter.isReady) null else "No printer") { sheet.dismiss(); testPrint() })
        body.addView(menuRow(R.drawable.ic_system_update, "Check for updates") { sheet.dismiss(); checkForUpdates(manual = true) })
        body.addView(menuRow(R.drawable.ic_logout, "Sign out", color = R.color.danger) { sheet.dismiss(); confirmSignOut() })
        sheet.show()
    }

    private fun initials(name: String) =
        name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }

    private fun confirmSignOut() {
        confirm("Sign out?",
            if (cart.isEmpty()) "${session.userName} will be signed out of this device." else "The current order (${count(itemCount, "item")}) will be lost.",
            "Sign out", danger = true) {
            lifecycleScope.launch {
                runCatching { api.post("/logout", JSONObject()) }
                session.signOut()
                goToLogin()
            }
        }
    }

    private fun count(n: Int, noun: String) = "$n $noun${if (n == 1) "" else "s"}"

    private fun watcher(after: () -> Unit) = object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(s: Editable?) = after()
    }

    // ── Menu grid ──

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
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_menu, parent, false).also { Fonts.apply(it) })

        override fun getItemCount() = items.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val item = items[position]
            val qty = cart[item.id]?.quantity ?: 0
            h.name.text = item.name
            h.name.setTextColor(getColor(if (item.available) R.color.text else R.color.muted))
            h.price.text = if (item.available) rs(item.price) else "Out of stock"
            h.price.setTextColor(getColor(when {
                !item.available -> R.color.danger
                qty > 0 -> R.color.primary_dark
                else -> R.color.muted
            }))
            h.itemView.alpha = if (item.available) 1f else 0.6f
            h.itemView.isSelected = qty > 0
            h.badge.visibility = if (qty > 0) View.VISIBLE else View.GONE
            h.badge.text = qty.toString()
            h.itemView.contentDescription = "${item.name}, ${rs(item.price)}" + if (qty > 0) ", $qty in the order" else ""
            h.itemView.setOnClickListener { addToCart(item, it) }
            h.itemView.setOnLongClickListener { if (qty > 0) { it.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); changeQuantity(item.id, -1); true } else false }
        }
    }
}
