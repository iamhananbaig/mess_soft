package com.messsoft.pos

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
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

/** Signed-in screens: session, API, the receipt print flow and small UI helpers. */
abstract class BaseActivity : ComponentActivity() {
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

    /**
     * After a sale (or a reprint): the accounts copy prints straight away, then the
     * cashier is asked whether the customer wants theirs.
     */
    protected fun printAccountsThenAsk(saleId: Int, saleTotal: Int?, change: Int?, reprint: Boolean) {
        printSale(saleId, EscPos.Copy.ACCOUNTS, reprint) {
            askCustomerCopy(saleId, saleTotal, change, reprint)
        }
    }

    private fun askCustomerCopy(saleId: Int, saleTotal: Int?, change: Int?, reprint: Boolean) {
        val box = dialogBox()
        box.addView(TextView(this).apply {
            text = if (reprint) "Sale #$saleId reprinted" else "Sale #$saleId saved"
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
        })
        if (saleTotal != null) box.addView(TextView(this).apply { text = "Total ${rs(saleTotal)}"; textSize = 18f; setPadding(0, dp(8), 0, 0) })
        if (change != null) {
            box.addView(TextView(this).apply {
                text = "Change ${rs(change)}"
                textSize = 26f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(getColor(R.color.primary_dark))
            })
        }
        box.addView(TextView(this).apply {
            text = "Print the customer copy?"
            textSize = 16f
            setTextColor(getColor(R.color.muted))
            setPadding(0, dp(12), 0, 0)
        })
        val dialog = AlertDialog.Builder(this).setView(box).setCancelable(false).create()
        addDialogButton(box, dialog, "Print customer copy", primary = true) { printSale(saleId, EscPos.Copy.CUSTOMER, reprint) {} }
        addDialogButton(box, dialog, "No", primary = false) {}
        dialog.show()
    }

    /** Prints one copy; [then] runs after it printed, or after the cashier skips a failed print. */
    private fun printSale(saleId: Int, copy: EscPos.Copy, reprint: Boolean, then: () -> Unit) {
        val name = if (copy == EscPos.Copy.ACCOUNTS) "accounts" else "customer"
        val progress = AlertDialog.Builder(this).setMessage("Printing $name copy…").setCancelable(false).show()
        lifecycleScope.launch {
            try {
                val data = ReceiptData.from(api.get("/sales/$saleId/receipt") as JSONObject)
                SunmiPrinter.print(this@BaseActivity, EscPos.receipt(data, copy, AppState.receiptSettings, reprint))
                progress.dismiss()
                then()
            } catch (e: Exception) {
                progress.dismiss()
                if (e is ApiException && handleAuth(e)) return@launch
                AlertDialog.Builder(this@BaseActivity)
                    .setTitle("Print failed")
                    .setMessage("${e.message}\n\nSale #$saleId is saved. You can reprint it later from ⋮ → Sales.")
                    .setCancelable(false)
                    .setPositiveButton("Retry") { _, _ -> printSale(saleId, copy, reprint, then) }
                    .setNegativeButton("Skip") { _, _ -> then() }
                    .show()
            }
        }
    }

    // ── Void review (managers) ──

    /**
     * Approve or reject a pending void request. Approving returns the sale's stock and
     * removes it from takings, so it asks once more. [onDone] runs after either.
     */
    protected fun reviewVoid(requestId: Int, saleId: Int, total: Int, requester: String, reason: String, onDone: () -> Unit) {
        val box = dialogBox()
        box.addView(TextView(this).apply {
            text = "Void sale #$saleId (${rs(total)})"
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
        })
        box.addView(TextView(this).apply {
            text = "Requested by $requester\nReason: $reason"
            textSize = 16f
            setPadding(0, dp(8), 0, dp(10))
        })
        val note = android.widget.EditText(this).apply {
            hint = "Note (optional)"
            textSize = 16f
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            filters = arrayOf(android.text.InputFilter.LengthFilter(255))
            setBackgroundResource(R.drawable.field)
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        box.addView(note, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)))
        val dialog = AlertDialog.Builder(this).setView(box).create()

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

        addDialogButton(box, dialog, "Approve void", primary = true) {
            hideKeyboard()
            AlertDialog.Builder(this)
                .setTitle("Approve void of sale #$saleId?")
                .setMessage("Its stock is returned and ${rs(total)} is removed from today's takings. This can't be undone.")
                .setPositiveButton("Approve") { _, _ -> send("approve") }
                .setNegativeButton("Cancel", null)
                .show()
        }.setBackgroundResource(R.drawable.btn_danger)
        addDialogButton(box, dialog, "Reject", primary = false) { hideKeyboard(); send("reject") }
        addDialogButton(box, dialog, "Cancel", primary = false) { hideKeyboard() }
        dialog.show()
    }

    // ── App updates ──

    /**
     * Asks GitHub for a newer release. Automatic checks ([manual] = false) run at most every
     * 6 hours and stay silent unless there is an update; a manual check always reports back.
     */
    protected fun checkForUpdates(manual: Boolean) {
        val now = System.currentTimeMillis()
        if (!manual && now - session.lastUpdateCheck < 6 * 60 * 60 * 1000L) return
        val progress = if (manual) AlertDialog.Builder(this).setMessage("Checking for updates…").setCancelable(false).show() else null
        lifecycleScope.launch {
            val installed = Updater.installedVersion(this@BaseActivity)
            try {
                val latest = Updater.latest()
                session.lastUpdateCheck = now
                progress?.dismiss()
                if (latest != null && Updater.isNewer(latest.version, installed)) {
                    offerUpdate(latest, installed)
                } else if (manual) {
                    showError("Up to date", "You have the latest version ($installed).")
                }
            } catch (e: Exception) {
                progress?.dismiss()
                if (manual) showError("Couldn't check for updates", "${e.message ?: "No connection"}\n\nInstalled version: $installed")
            }
        }
    }

    private fun offerUpdate(release: Updater.Release, installed: String) {
        val box = dialogBox()
        box.addView(TextView(this).apply {
            text = "Update available: ${release.version}"
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
        })
        box.addView(TextView(this).apply {
            text = "Installed: $installed · Download: ${"%.1f".format(java.util.Locale.US, release.size / 1_048_576.0)} MB"
            textSize = 14f
            setTextColor(getColor(R.color.muted))
            setPadding(0, dp(4), 0, dp(8))
        })
        if (release.notes.isNotEmpty()) {
            box.addView(TextView(this).apply {
                text = release.notes.take(1500)
                textSize = 15f
            })
        }
        val dialog = AlertDialog.Builder(this).setView(android.widget.ScrollView(this).apply { addView(box) }).create()
        addDialogButton(box, dialog, "Update now", primary = true) { downloadAndInstall(release) }
        addDialogButton(box, dialog, "Later", primary = false) {}
        dialog.show()
    }

    private fun downloadAndInstall(release: Updater.Release) {
        val progress = AlertDialog.Builder(this).setMessage("Downloading ${release.version}… 0%").setCancelable(false).show()
        lifecycleScope.launch {
            try {
                val apk = Updater.download(this@BaseActivity, release) { percent ->
                    progress.setMessage("Downloading ${release.version}… $percent%")
                }
                progress.dismiss()
                Updater.install(this@BaseActivity, apk)
            } catch (e: Exception) {
                progress.dismiss()
                AlertDialog.Builder(this@BaseActivity)
                    .setTitle("Update failed")
                    .setMessage(e.message ?: "Download failed")
                    .setPositiveButton("Retry") { _, _ -> downloadAndInstall(release) }
                    .setNegativeButton("Close", null)
                    .show()
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

    // ── UI helpers ──

    protected fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    protected fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    protected fun hideKeyboard() {
        val imm = getSystemService(InputMethodManager::class.java)
        currentFocus?.let { imm.hideSoftInputFromWindow(it.windowToken, 0); it.clearFocus() }
    }

    protected fun showError(title: String, message: String?) {
        AlertDialog.Builder(this).setTitle(title).setMessage(message).setPositiveButton("OK", null).show()
    }

    /** Pill-shaped filter chip; [selected] chips are filled. */
    protected fun chip(label: String, selected: Boolean, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 15f
        gravity = Gravity.CENTER
        minHeight = dp(40)
        setPadding(dp(16), 0, dp(16), 0)
        setBackgroundResource(R.drawable.chip)
        isSelected = selected
        setTextColor(if (selected) 0xFFFFFFFF.toInt() else getColor(R.color.text))
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(8) }
    }

    /** Vertical container for a custom dialog body. */
    protected fun dialogBox() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(20), dp(20), dp(12))
    }

    /** Full-width dialog button that dismisses [dialog] and then runs [onClick]. */
    protected fun addDialogButton(box: LinearLayout, dialog: AlertDialog, label: String, primary: Boolean, onClick: () -> Unit): Button {
        val b = Button(this, null, 0, if (primary) R.style.PrimaryButton else R.style.SecondaryButton)
        b.text = label
        b.gravity = Gravity.CENTER
        b.setOnClickListener { dialog.dismiss(); onClick() }
        box.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(if (primary) 56 else 50)).apply { topMargin = dp(if (primary) 16 else 8) })
        return b
    }
}
