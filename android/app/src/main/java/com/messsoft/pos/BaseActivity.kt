package com.messsoft.pos

import android.content.Intent
import android.content.res.ColorStateList
import android.os.Build
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Shared across screens for the life of the app process. */
object AppState {
    /** Slip layout from GET /settings/receipt, loaded with the menu. */
    var receiptSettings = ReceiptSettings()

    /** Payment method key → label, from GET /settings/pos. */
    var paymentLabels: Map<String, String> = mapOf("cash" to "Cash")

    /** Set when the menu was edited, so the POS screen reloads it. */
    var menuChanged = false
}

/**
 * Every screen: edge-to-edge window with system-bar and keyboard insets, the app font,
 * the shared top bar, and dialogs (bottom sheets and pop-ups).
 */
abstract class ScreenActivity : ComponentActivity() {
    private var windowReady = false

    override fun onContentChanged() {
        super.onContentChanged()
        if (windowReady) return
        windowReady = true
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT < 27) window.navigationBarColor = getColor(R.color.ink) // no dark nav icons before 8.1
        val content = findViewById<ViewGroup>(android.R.id.content)
        content.setBackgroundColor(getColor(R.color.surface))
        ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
        Fonts.install(window.decorView)
    }

    // ── Top bar (view_topbar) ──

    protected fun topBar(title: String, back: Boolean = true) {
        findViewById<TextView>(R.id.title).text = title
        val backButton = findViewById<View>(R.id.back)
        if (back) backButton.setOnClickListener { onBackPressedDispatcher.onBackPressed() }
        else {
            backButton.visibility = View.GONE
            findViewById<View>(R.id.titleBox).setPadding(dp(14), 0, dp(8), 0)
        }
    }

    protected fun topSummary(text: CharSequence?) {
        findViewById<TextView>(R.id.summary).apply {
            this.text = text
            visibility = if (text.isNullOrEmpty()) View.GONE else View.VISIBLE
        }
    }

    protected fun addTopAction(icon: Int, description: String, onClick: () -> Unit): FrameLayout =
        topAction(icon, description, onClick).also { findViewById<LinearLayout>(R.id.actions).addView(it) }

    /** The thin loading line under the top bar, for refreshes over content already shown. */
    protected fun busy(on: Boolean) {
        findViewById<ProgressBar>(R.id.progress)?.visibility = if (on) View.VISIBLE else View.INVISIBLE
    }

    // ── Dialogs ──

    protected fun showError(title: String, message: String?) {
        Sheet(this, centered = true).title(title).message(message ?: "").apply { button("OK", ButtonKind.SECONDARY) }.show()
    }

    protected fun confirm(title: String, message: String, action: String, danger: Boolean = false, onConfirm: () -> Unit) {
        Sheet(this, centered = true).title(title).message(message).apply {
            buttonPair("Cancel", action, if (danger) ButtonKind.DANGER else ButtonKind.PRIMARY, onPrimary = onConfirm)
        }.show()
    }

    /** A pop-up with a spinner, for short waits that block the screen. */
    protected fun progressPopup(message: String): Pair<Sheet, TextView> {
        val sheet = Sheet(this, centered = true).cancelable(false)
        val label = text(message, 16f)
        sheet.body.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(ProgressBar(context).apply { indeterminateTintList = ColorStateList.valueOf(getColor(R.color.primary)) }, lp(dp(32), dp(32)).apply { marginEnd = dp(16) })
            addView(label, lp(0, weight = 1f))
        })
        return sheet.show() to label
    }

    protected fun field(hint: String, inputType: Int = InputType.TYPE_CLASS_TEXT, maxLength: Int = 255) = EditText(this).apply {
        this.hint = hint
        textSize = 17f
        this.inputType = inputType
        isSingleLine = inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE == 0
        filters = arrayOf(InputFilter.LengthFilter(maxLength))
        setBackgroundResource(R.drawable.field)
        setPadding(dp(14), dp(12), dp(14), dp(12))
        minHeight = dp(52)
        layoutParams = lp()
    }

    protected fun label(value: String) = text(value, 14f, R.color.muted, bold = true).apply { setPadding(0, dp(14), 0, dp(6)) }

    /** Filter chip; selected chips are filled. */
    protected fun chip(label: String, selected: Boolean, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 15f
        gravity = Gravity.CENTER
        minHeight = dp(38)
        setPadding(dp(16), 0, dp(16), 0)
        setBackgroundResource(R.drawable.pill)
        isSelected = selected
        setTextColor(if (selected) getColor(R.color.surface) else getColor(R.color.text))
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(8) }
    }

    protected fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    protected fun hideKeyboard() {
        val imm = getSystemService(InputMethodManager::class.java)
        currentFocus?.let { imm.hideSoftInputFromWindow(it.windowToken, 0); it.clearFocus() }
    }
}

/** Signed-in screens: session, API, receipt printing, void review and app updates. */
abstract class BaseActivity : ScreenActivity() {
    protected lateinit var session: Session
    protected lateinit var api: Api

    /** Call first in onCreate; false means there's no session and the activity is closing. */
    protected fun requireSession(): Boolean {
        session = Session(this)
        if (session.token == null) {
            goToLogin()
            return false
        }
        api = Api(session)
        SunmiPrinter.bind(this)
        return true
    }

    // ── Receipt printing ──

    /** Reprint: a sheet with both copies — accounts prints straight away, customer on a tap. */
    protected fun reprint(saleId: Int) {
        val sheet = Sheet(this).title("Reprint sale #$saleId", "The accounts copy prints first.")
        ReceiptCopies(saleId, reprint = true, container = sheet.body)
        sheet.button("Done", ButtonKind.SECONDARY)
        sheet.show()
    }

    /**
     * The two receipt copies as status rows. The accounts copy prints at once; the customer
     * copy waits for the cashier's tap, and is offered once the accounts copy is done (or failed).
     */
    protected inner class ReceiptCopies(private val saleId: Int, private val reprint: Boolean, container: LinearLayout) {
        private var data: ReceiptData? = null
        private var printing = false
        private var customerOffered = false
        private val accounts = CopyRow(EscPos.Copy.ACCOUNTS, "Accounts copy")
        private val customer = CopyRow(EscPos.Copy.CUSTOMER, "Customer copy")

        init {
            container.addView(accounts.view)
            container.addView(customer.view, lp().apply { topMargin = dp(8) })
            customer.show(Icon.WAITING, "Offered after the accounts copy", null)
            accounts.print()
        }

        private inner class CopyRow(val copy: EscPos.Copy, label: String) {
            private val iconBox = FrameLayout(this@BaseActivity).apply { setBackgroundResource(R.drawable.icon_circle) }
            private val icon = ImageView(this@BaseActivity)
            private val spinner = ProgressBar(this@BaseActivity).apply {
                indeterminateTintList = ColorStateList.valueOf(getColor(R.color.primary))
                visibility = View.GONE
            }
            private val status = text("", 14f, R.color.muted)
            private val action = button("Print", ButtonKind.SECONDARY) { print() }.apply { textSize = 15f; minWidth = dp(88) }
            val view = LinearLayout(this@BaseActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundResource(R.drawable.card)
                setPadding(dp(12), dp(10), dp(10), dp(10))
                iconBox.addView(icon, FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER))
                iconBox.addView(spinner, FrameLayout.LayoutParams(dp(26), dp(26), Gravity.CENTER))
                addView(iconBox, lp(dp(42), dp(42)).apply { marginEnd = dp(12) })
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(text(label, 16f, bold = true))
                    addView(status)
                }, lp(0, weight = 1f))
                addView(action, lp(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)).apply { marginStart = dp(8) })
            }

            fun show(state: Icon?, message: String, actionLabel: String?) {
                spinner.visibility = if (state == null) View.VISIBLE else View.GONE
                icon.visibility = if (state == null) View.GONE else View.VISIBLE
                val s = state ?: Icon.READY
                icon.setImageResource(s.res)
                icon.imageTintList = ColorStateList.valueOf(getColor(s.tint))
                iconBox.backgroundTintList = ColorStateList.valueOf(getColor(s.bg))
                status.text = message
                status.setTextColor(getColor(if (state == Icon.FAILED) R.color.danger else R.color.muted))
                action.visibility = if (actionLabel == null) View.GONE else View.VISIBLE
                action.text = actionLabel
            }

            fun print() {
                if (printing) return
                printing = true
                show(null, "Printing…", null)
                lifecycleScope.launch {
                    try {
                        val receipt = data ?: ReceiptData.from(api.get("/sales/$saleId/receipt") as JSONObject).also { data = it }
                        SunmiPrinter.print(this@BaseActivity, EscPos.receipt(receipt, copy, AppState.receiptSettings, reprint))
                        printing = false
                        show(Icon.DONE, "Printed", "Again")
                    } catch (e: Exception) {
                        printing = false
                        if (e is ApiException && handleAuth(e)) return@launch
                        show(Icon.FAILED, e.message ?: "Print failed", "Retry")
                    }
                    if (copy == EscPos.Copy.ACCOUNTS && !customerOffered) {
                        customerOffered = true
                        customer.show(Icon.READY, "If the customer wants one", "Print")
                    }
                }
            }
        }
    }

    // ── Void review (managers) ──

    /**
     * Approve or reject a pending void request. Approving returns the sale's stock and
     * removes it from takings, so it asks once more. [onDone] runs after either.
     */
    protected fun reviewVoid(requestId: Int, saleId: Int, total: Int, requester: String, reason: String, onDone: () -> Unit) {
        val sheet = Sheet(this).title("Void sale #$saleId?", "${rs(total)} · requested by $requester")
        sheet.body.addView(text(reason.ifEmpty { "No reason given" }, 16f).apply {
            setBackgroundResource(R.drawable.status_pill)
            setPadding(dp(14), dp(12), dp(14), dp(12))
        }, lp())
        sheet.body.addView(label("Note for the cashier (optional)"))
        val note = field("e.g. Checked with the customer", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)
        sheet.body.addView(note)

        fun send(action: String) {
            lifecycleScope.launch {
                try {
                    val body = JSONObject()
                    note.text.toString().trim().takeIf { it.isNotEmpty() }?.let { body.put("note", it) }
                    api.post("/void-requests/$requestId/$action", body)
                    toast(if (action == "approve") "Sale #$saleId voided" else "Void request rejected")
                } catch (e: ApiException) {
                    if (handleAuth(e)) return@launch
                    showError("Not saved", e.message)
                }
                onDone()
            }
        }

        sheet.button("Approve void", ButtonKind.DANGER) {
            hideKeyboard()
            confirm("Approve the void?", "Sale #$saleId's stock is returned and ${rs(total)} is taken off the takings. This can't be undone.",
                "Approve", danger = true) { send("approve") }
        }
        sheet.button("Reject request", ButtonKind.SECONDARY) { hideKeyboard(); send("reject") }
        sheet.show()
    }

    // ── App updates ──

    /**
     * Asks GitHub for a newer release. Automatic checks ([manual] = false) run at most every
     * 6 hours and stay silent unless there is an update; a manual check always reports back.
     */
    protected fun checkForUpdates(manual: Boolean) {
        val now = System.currentTimeMillis()
        if (!manual && now - session.lastUpdateCheck < 6 * 60 * 60 * 1000L) return
        val progress = if (manual) progressPopup("Checking for updates…").first else null
        lifecycleScope.launch {
            val installed = Updater.installedVersion(this@BaseActivity)
            try {
                val latest = Updater.latest()
                session.lastUpdateCheck = now
                progress?.dismiss()
                if (latest != null && Updater.isNewer(latest.version, installed)) {
                    offerUpdate(latest, installed)
                } else if (manual) {
                    showError("You're up to date", "Version $installed is the latest.")
                }
            } catch (e: Exception) {
                progress?.dismiss()
                if (manual) showError("Couldn't check for updates", "${e.message ?: "No connection"}\n\nInstalled version: $installed")
            }
        }
    }

    private fun offerUpdate(release: Updater.Release, installed: String) {
        val size = "%.1f".format(java.util.Locale.US, release.size / 1_048_576.0)
        val sheet = Sheet(this).title("Version ${release.version} is available", "You have $installed · $size MB download")
        if (release.notes.isNotEmpty()) sheet.message(release.notes.take(1500))
        sheet.button("Update now") { downloadAndInstall(release) }
        sheet.button("Later", ButtonKind.SECONDARY)
        sheet.show()
    }

    private fun downloadAndInstall(release: Updater.Release) {
        val (popup, label) = progressPopup("Downloading ${release.version}… 0%")
        lifecycleScope.launch {
            try {
                val apk = Updater.download(this@BaseActivity, release) { percent ->
                    label.text = "Downloading ${release.version}… $percent%"
                }
                popup.dismiss()
                Updater.install(this@BaseActivity, apk)
            } catch (e: Exception) {
                popup.dismiss()
                Sheet(this@BaseActivity, centered = true).title("Update failed").message(e.message ?: "Download failed").apply {
                    buttonPair("Close", "Retry") { downloadAndInstall(release) }
                }.show()
            }
        }
    }

    // ── Session ──

    /** 401 → the token was revoked or expired: back to sign-in. */
    protected fun handleAuth(e: ApiException): Boolean {
        if (e.status != 401) return false
        session.signOut()
        toast("Signed out. Please sign in again.")
        goToLogin()
        return true
    }

    protected fun goToLogin() {
        startActivity(Intent(this, LoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK or Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }
}

/** Look of a receipt-copy row's icon. */
private enum class Icon(val res: Int, val tint: Int, val bg: Int) {
    WAITING(R.drawable.ic_print, R.color.muted, R.color.bg),
    READY(R.drawable.ic_print, R.color.primary, R.color.primary_soft),
    DONE(R.drawable.ic_check, R.color.success, R.color.success_soft),
    FAILED(R.drawable.ic_error, R.color.danger, R.color.danger_soft),
}
