package com.messsoft.pos

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat

/**
 * Plus Jakarta Sans everywhere. XML font families need Android 8 and the V2 runs 7.1, so
 * each window's views are walked after layout and given the right cut:
 * regular, bold → SemiBold, and bold at 22sp or larger → ExtraBold (amounts, headlines).
 */
object Fonts {
    private var regular: Typeface? = null
    private var semibold: Typeface? = null
    private var extrabold: Typeface? = null

    private fun load(context: Context) {
        if (regular != null) return
        regular = ResourcesCompat.getFont(context, R.font.jakarta_regular)
        semibold = ResourcesCompat.getFont(context, R.font.jakarta_semibold)
        extrabold = ResourcesCompat.getFont(context, R.font.jakarta_extrabold)
    }

    /** Applies now and after every later layout of [root] (adapters, dynamic content). */
    fun install(root: View) {
        load(root.context)
        apply(root)
        root.viewTreeObserver.addOnGlobalLayoutListener { apply(root) }
    }

    fun apply(view: View) {
        if (view is TextView) style(view)
        if (view is ViewGroup) for (i in 0 until view.childCount) apply(view.getChildAt(i))
    }

    private fun style(tv: TextView) {
        val current = tv.typeface
        if (current != null && (current === regular || current === semibold || current === extrabold)) return
        val bold = current?.isBold == true
        val large = tv.textSize >= TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 22f, tv.resources.displayMetrics)
        tv.typeface = when {
            !bold -> regular
            large -> extrabold
            else -> semibold
        }
    }
}

fun Context.dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

/** Plain text view; [bold] picks SemiBold (ExtraBold at 22sp+) through [Fonts]. */
fun Context.text(value: CharSequence, size: Float = 16f, color: Int = R.color.text, bold: Boolean = false, money: Boolean = false) =
    TextView(this).apply {
        text = value
        textSize = size
        setTextColor(getColor(color))
        if (bold) setTypeface(Typeface.DEFAULT, Typeface.BOLD)
        if (money) fontFeatureSettings = "tnum"
    }

/** A status word on a tinted pill — status is never shown by colour alone. */
fun Context.statusPill(label: String, color: Int, soft: Int) = TextView(this).apply {
    text = label
    textSize = 12f
    setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    setTextColor(getColor(color))
    setBackgroundResource(R.drawable.status_pill)
    backgroundTintList = ColorStateList.valueOf(getColor(soft))
    setPadding(dp(8), dp(3), dp(8), dp(3))
}

fun Context.button(label: String, kind: ButtonKind, onClick: () -> Unit): Button {
    val style = if (kind == ButtonKind.PRIMARY || kind == ButtonKind.DANGER) R.style.PrimaryButton else R.style.SecondaryButton
    return Button(this, null, 0, style).apply {
        text = label
        gravity = Gravity.CENTER
        isSingleLine = true
        ellipsize = TextUtils.TruncateAt.END
        when (kind) {
            ButtonKind.DANGER -> setBackgroundResource(R.drawable.btn_danger)
            ButtonKind.DANGER_QUIET -> setTextColor(getColor(R.color.danger))
            else -> {}
        }
        setOnClickListener { onClick() }
    }
}

enum class ButtonKind { PRIMARY, SECONDARY, DANGER, DANGER_QUIET }

fun lp(width: Int = ViewGroup.LayoutParams.MATCH_PARENT, height: Int = ViewGroup.LayoutParams.WRAP_CONTENT, weight: Float = 0f) =
    LinearLayout.LayoutParams(width, height, weight)

/**
 * A bottom sheet (or, with [centered], a pop-up card) built from code: a title, any
 * content in [body], and full-width buttons. Long content scrolls; buttons stay at the end.
 */
class Sheet(private val activity: Activity, private val centered: Boolean = false) {
    val dialog = Dialog(activity, if (centered) R.style.Popup else R.style.Sheet)
    val body = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    private val footer = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    private val ctx: Context = activity

    init {
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(if (centered) R.drawable.popup_bg else R.drawable.sheet_bg)
            setPadding(ctx.dp(20), ctx.dp(if (centered) 22 else 10), ctx.dp(20), ctx.dp(16))
        }
        if (!centered) {
            root.addView(View(activity).apply { setBackgroundResource(R.drawable.sheet_handle) },
                LinearLayout.LayoutParams(ctx.dp(36), ctx.dp(4)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = ctx.dp(14) })
        }
        val scroll = ScrollView(activity).apply { isVerticalScrollBarEnabled = false; addView(body) }
        // Weighted so that, when the window is full height, the scroll shrinks and the buttons stay visible.
        root.addView(scroll, lp(weight = 1f))
        root.addView(footer)
        dialog.setContentView(root)
        dialog.window?.apply {
            val width = if (centered) minOf(activity.resources.displayMetrics.widthPixels - ctx.dp(32), ctx.dp(420))
                else WindowManager.LayoutParams.MATCH_PARENT
            setLayout(width, WindowManager.LayoutParams.WRAP_CONTENT)
            setGravity(if (centered) Gravity.CENTER else Gravity.BOTTOM)
            Fonts.install(decorView)
        }
    }

    fun title(title: String, subtitle: String? = null): Sheet {
        body.addView(ctx.text(title, 20f, bold = true))
        subtitle?.let { body.addView(ctx.text(it, 15f, R.color.muted).apply { setPadding(0, ctx.dp(4), 0, 0) }) }
        body.addView(View(ctx), lp(height = ctx.dp(12)))
        return this
    }

    fun message(text: CharSequence): Sheet {
        body.addView(ctx.text(text, 16f).apply { setLineSpacing(0f, 1.15f) })
        return this
    }

    /** Adds a full-width button; it closes the sheet first unless [keepOpen]. */
    fun button(label: String, kind: ButtonKind = ButtonKind.PRIMARY, keepOpen: Boolean = false, onClick: () -> Unit = {}): Button {
        val primary = kind == ButtonKind.PRIMARY || kind == ButtonKind.DANGER
        val b = ctx.button(label, kind) { if (!keepOpen) dialog.dismiss(); onClick() }
        footer.addView(b, lp(height = ctx.dp(if (primary) 54 else 50)).apply { topMargin = ctx.dp(if (footer.childCount == 0) 18 else 8) })
        return b
    }

    /** Two buttons side by side: [secondary] on the left, [primary] on the right. */
    fun buttonPair(secondary: String, primary: String, primaryKind: ButtonKind = ButtonKind.PRIMARY, onSecondary: () -> Unit = {}, onPrimary: () -> Unit) {
        val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(ctx.button(secondary, ButtonKind.SECONDARY) { dialog.dismiss(); onSecondary() }, lp(0, ctx.dp(52), 1f).apply { marginEnd = ctx.dp(6) })
        row.addView(ctx.button(primary, primaryKind) { dialog.dismiss(); onPrimary() }, lp(0, ctx.dp(52), 1f).apply { marginStart = ctx.dp(6) })
        footer.addView(row, lp().apply { topMargin = ctx.dp(18) })
    }

    fun cancelable(value: Boolean): Sheet { dialog.setCancelable(value); return this }

    fun onDismiss(block: () -> Unit): Sheet { dialog.setOnDismissListener { block() }; return this }

    fun show(): Sheet { dialog.show(); return this }

    fun dismiss() = dialog.dismiss()
}

/** One tappable row in a sheet menu: icon, label, optional detail and count badge. */
fun Context.menuRow(icon: Int, label: String, detail: String? = null, badge: Int = 0, color: Int = R.color.text, enabled: Boolean = true, onClick: () -> Unit) =
    LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        minimumHeight = dp(52)
        setBackgroundResource(R.drawable.ripple_row)
        setPadding(dp(4), 0, dp(4), 0)
        addView(ImageView(context).apply {
            setImageResource(icon)
            imageTintList = ColorStateList.valueOf(getColor(color))
        }, lp(dp(24), dp(24)).apply { marginEnd = dp(16) })
        addView(text(label, 16f, color), lp(0, weight = 1f))
        detail?.let { addView(text(it, 14f, R.color.muted).apply { setPadding(dp(8), 0, 0, 0) }) }
        if (badge > 0) {
            addView(text(badge.toString(), 13f, R.color.surface, bold = true).apply {
                gravity = Gravity.CENTER
                minWidth = dp(24)
                setPadding(dp(7), dp(2), dp(7), dp(2))
                setBackgroundResource(R.drawable.qty_badge)
                backgroundTintList = ColorStateList.valueOf(getColor(R.color.warning))
            })
        }
        isEnabled = enabled
        alpha = if (enabled) 1f else 0.4f
        setOnClickListener { onClick() }
    }

/** Loading, empty and error states over a list (layout view_state). */
class StateView(root: View) {
    private val container: View = root.findViewById(R.id.state)
    private val iconBox: View = root.findViewById(R.id.stateIconBox)
    private val icon: ImageView = root.findViewById(R.id.stateIcon)
    private val spinner: View = root.findViewById(R.id.stateSpinner)
    private val title: TextView = root.findViewById(R.id.stateTitle)
    private val message: TextView = root.findViewById(R.id.stateMessage)
    private val action: Button = root.findViewById(R.id.stateAction)

    val isVisible get() = container.visibility == View.VISIBLE

    fun loading(text: String) {
        show(null, text, null, null, null)
        spinner.visibility = View.VISIBLE
    }

    fun empty(iconRes: Int, title: String, message: String?, actionLabel: String? = null, onAction: (() -> Unit)? = null) =
        show(iconRes, title, message, actionLabel, onAction)

    /** Unreachable server gets its own icon; everything else is a generic error. */
    fun error(e: Exception, onRetry: () -> Unit) {
        val offline = e is ApiException && e.status == 0
        show(if (offline) R.drawable.ic_wifi_off else R.drawable.ic_error,
            if (offline) "Can't reach the server" else "Something went wrong",
            e.message, "Try again", onRetry)
    }

    fun hide() { container.visibility = View.GONE }

    private fun show(iconRes: Int?, titleText: String, messageText: String?, actionLabel: String?, onAction: (() -> Unit)?) {
        container.visibility = View.VISIBLE
        spinner.visibility = View.GONE
        iconBox.visibility = if (iconRes == null) View.GONE else View.VISIBLE
        iconRes?.let { icon.setImageResource(it) }
        title.text = titleText
        message.text = messageText.orEmpty()
        message.visibility = if (messageText.isNullOrEmpty()) View.GONE else View.VISIBLE
        action.visibility = if (actionLabel == null) View.GONE else View.VISIBLE
        action.text = actionLabel
        action.setOnClickListener { onAction?.invoke() }
    }
}

/** Icon button for the top bar's action area. */
fun Context.topAction(icon: Int, description: String, onClick: () -> Unit) = FrameLayout(this).apply {
    addView(ImageView(context).apply {
        setImageResource(icon)
        scaleType = ImageView.ScaleType.CENTER
        imageTintList = ColorStateList.valueOf(getColor(R.color.text))
        contentDescription = description
        setBackgroundResource(R.drawable.ripple_round)
        setOnClickListener { onClick() }
    }, FrameLayout.LayoutParams(dp(48), dp(48)))
    layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
}
