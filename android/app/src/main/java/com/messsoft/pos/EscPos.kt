package com.messsoft.pos

import java.io.ByteArrayOutputStream
import java.text.Normalizer
import java.util.Locale

/**
 * ESC/POS receipt encoder for the Sunmi V2's built-in 58mm printer (384 dots).
 *
 * A port of the 58mm path of frontend/src/lib/escpos.ts, so slips from the V2 match
 * the web app's: same layout settings, copy labels, never-truncated text and 3-char
 * right margin on bold lines. Keep the two in step when the receipt layout changes.
 */
object EscPos {
    private const val WIDTH_DOTS = 384


    /**
     * The V2 ignores ESC M (font select) and always prints Font A, 12 dots wide:
     * 31 columns. The item table is laid out for that width (name line, then qty line).
     */
    private const val BODY_FONT = 'A'
    private const val COLUMNS = 31

    /** Lines fed after the tear guide so it clears the V2's tear bar (the web setting is tuned for the BT600M). */
    private const val TEAR_FEED_LINES = 2

    enum class Copy { CUSTOMER, ACCOUNTS }

    fun receipt(data: ReceiptData, copy: Copy, s: ReceiptSettings, reprint: Boolean): ByteArray {
        val p = Buf()
        val title = s.canteenName.ifEmpty { data.canteenName }
        val isCash = data.paymentMethod == "Cash"
        // No 3-char margin like the BT600M needs: the V2 handles full-width bold lines.
        val safeW = COLUMNS

        p.initialize()
        p.font(BODY_FONT)
        p.printWidth(WIDTH_DOTS)

        // Header
        // Canteen name from Settings, as saved — no decoration, so it stays as large as it fits.
        p.heading(title, s.titleSize)
        if (s.showBranch && s.branchName.isNotEmpty()) p.text(s.branchName + "\n")
        s.headerLines.split(Regex("\\r?\\n")).map { it.trim() }.filter { it.isNotEmpty() }.take(3)
            .forEach { p.text(it + "\n") }
        p.sep(s.sepAfterHeader, safeW)

        // Voided sale reprint — impossible to miss
        if (data.voided) {
            p.bold(true)
            p.doubleSize(true)
            p.text("** VOID **\n")
            p.doubleSize(false)
            p.text("Not valid as a receipt\n")
            p.bold(false)
            p.rule('=', safeW)
        }

        // Copy label — prominent so customer and accounts slips are never mixed up
        val label = when (copy) {
            Copy.CUSTOMER -> s.customerCopyLabel.trim().ifEmpty { "CUSTOMER COPY" }
            Copy.ACCOUNTS -> s.accountsCopyLabel.trim().ifEmpty { "ACCOUNTS COPY" }
        }
        p.heading(label, s.copyLabelSize)
        p.sep(s.sepAfterCopy, safeW)

        // Info
        p.align(0)
        val status = if (reprint) "DUPLICATE" else "ORIGINAL"
        val number = if (s.showReceiptNumber) "#${data.receiptNumber}" else ""
        val whenText = if (s.showDatetime) "${data.date}  ${data.time}" else ""
        if (number.isNotEmpty() || whenText.isNotEmpty()) p.text(twoColumns(number, whenText, safeW))
        p.text(if (s.showCashier) twoColumns("Cashier: ${data.cashier}", status, safeW) else padLeft(status, safeW) + "\n")
        p.sep(s.sepItems, safeW)

        // Items — 31 columns is too narrow for a name column, so each item is
        // its name (wrapped, never cut short), then "qty x rate ... amount".
        if (s.showItemHeader) {
            p.text(twoColumns("Item / Qty x Rate", "Amount", safeW))
            p.sep(s.sepItems, safeW)
        }
        for (item in data.items) {
            p.bold(true)
            p.text(wrap(item.name, safeW).joinToString("\n") + "\n")
            p.bold(false)
            p.text(twoColumns("   ${item.quantity} x ${commas(item.rate)}", commas(item.amount), safeW))
        }
        p.sep(s.sepItems, safeW)

        // Total — never truncated; bold lines stay 3 chars short of the edge.
        p.sep(s.sepTotal, safeW)
        val big = s.totalSize != "normal"
        val totalW = safeW
        val totalText = "Rs.${commas(data.total)}"
        if (big) p.font('A')
        p.bold(true)
        if (s.totalSize == "xlarge") p.doubleHeight(true)
        p.text("TOTAL" + " ".repeat(maxOf(1, totalW - 5 - totalText.length)) + totalText + "\n")
        if (s.totalSize == "xlarge") p.doubleHeight(false)
        p.bold(false)
        if (big) p.font(BODY_FONT)
        p.sep(s.sepTotal, safeW)

        // Payment
        if (s.showPayment) {
            p.blank(s.spaceBeforePayment)
            if (isCash && data.amountReceived != null) {
                p.text(twoColumns("Paid: Rs.${commas(data.amountReceived)}", "Change: Rs.${commas(data.change ?: 0)}", safeW))
            } else {
                p.text("Paid by: ${data.paymentMethod}\n")
                data.paymentReference?.let { p.text("Ref: $it\n") }
            }
            p.blank(s.spaceAfterPayment)
        }

        // Footer
        if (s.footerText.isNotEmpty()) {
            p.sep(s.sepBeforeFooter, safeW)
            p.align(1)
            p.bold(true)
            p.text(s.footerText + "\n")
            p.bold(false)
        }
        p.align(0)
        p.sep(s.sepEnd, safeW)

        // No cutter: tear guide, then feed so this copy clears the tear bar.
        p.feed(1)
        if (s.showTearLine) {
            p.align(1)
            p.text("- - - -  TEAR HERE  - - - -\n")
        }
        p.feed(TEAR_FEED_LINES)
        return p.bytes()
    }

    /** One invoice on the day-end summary. */
    data class SummaryLine(val invoice: String, val time: String, val amount: Int)

    data class DaySummary(
        val date: String,
        val cashier: String,
        val printedAt: String,
        /** Valid (not voided) sales, oldest first. */
        val sales: List<SummaryLine>,
        val voids: List<SummaryLine>,
        /** Sales with a void request still waiting for a manager. */
        val pendingVoids: List<SummaryLine>,
    )

    /** Day-end summary for one cashier: invoice-wise sales and voids, totals, pending-void warning. */
    fun daySummary(d: DaySummary, s: ReceiptSettings): ByteArray {
        val p = Buf()
        val w = COLUMNS
        fun pair(label: String, value: String) = p.text(label + " ".repeat(maxOf(1, w - label.length - value.length)) + value + "\n")
        // Invoice (10) · time (10) · amount (11) = 31 columns
        fun invoiceRow(l: SummaryLine) = p.text(padRight(l.invoice, 10) + padRight(l.time, 10) + padLeft(commas(l.amount), w - 20) + "\n")
        fun table(title: String, lines: List<SummaryLine>) {
            p.bold(true); p.text("$title (${lines.size})\n"); p.bold(false)
            if (lines.isEmpty()) {
                p.text("  None\n")
            } else {
                p.text(padRight("Inv#", 10) + padRight("Time", 10) + padLeft("Amount", w - 20) + "\n")
                p.rule('-', w)
                lines.forEach { invoiceRow(it) }
            }
            p.rule('-', w)
        }

        p.initialize()
        p.font(BODY_FONT)
        p.printWidth(WIDTH_DOTS)
        val title = s.canteenName
        if (title.isNotEmpty()) p.heading(title, s.titleSize)
        p.heading("DAY END SUMMARY", "large")
        p.align(0)
        p.rule('=', w)
        pair("Date:", d.date)
        p.text(twoColumns("Cashier:", d.cashier, w))
        pair("Printed:", d.printedAt)
        p.rule('=', w)

        table("SALES", d.sales)
        table("VOIDS", d.voids)

        p.bold(true)
        pair("Sales count", d.sales.size.toString())
        pair("Void count", d.voids.size.toString())
        p.rule('-', w)
        pair("Sales amount", "Rs.${commas(d.sales.sumOf { it.amount })}")
        pair("Void amount", "Rs.${commas(d.voids.sumOf { it.amount })}")
        p.bold(false)
        p.rule('=', w)

        if (d.pendingVoids.isNotEmpty()) {
            p.align(1)
            p.bold(true)
            p.doubleSize(true)
            p.text("WARNING\n")
            p.doubleSize(false)
            val n = d.pendingVoids.size
            p.text("$n VOID REQUEST${if (n == 1) "" else "S"} PENDING\n")
            p.bold(false)
            p.align(0)
            d.pendingVoids.forEach { invoiceRow(it) }
            p.text(wrap("Pending sales are counted in sales above until a manager approves or rejects them. Cash closing is blocked until then.", w).joinToString("\n") + "\n")
            p.rule('=', w)
        }

        p.feed(2)
        p.text("Cashier sign: _________________\n\n")
        p.text("Manager sign: _________________\n")
        p.feed(1)
        p.align(1)
        p.text("- - - -  TEAR HERE  - - - -\n")
        p.feed(TEAR_FEED_LINES)
        return p.bytes()
    }

    /** Checks the printer, fonts and widths: a ruler in each font and a sample bold total. */
    fun testPage(canteenName: String, printedBy: String, server: String, at: String): ByteArray {
        val p = Buf()
        val safeW = COLUMNS
        p.initialize()
        p.font(BODY_FONT)
        p.printWidth(WIDTH_DOTS)
        p.heading("TEST PRINT", "xlarge")
        if (canteenName.isNotEmpty()) p.text(canteenName + "\n")
        p.align(0)
        p.rule('=', safeW)
        p.text("$COLUMNS columns:\n")
        p.text(ruler(COLUMNS) + "\n")
        p.rule('-', safeW)
        p.text(twoColumns("Printed by: $printedBy", at, safeW))
        p.text(wrap("Server: $server", safeW).joinToString("\n") + "\n")
        p.rule('=', safeW)
        p.font('A')
        p.bold(true)
        p.doubleHeight(true)
        val total = "Rs.1,234"
        val w = safeW
        p.text("TOTAL" + " ".repeat(maxOf(1, w - 5 - total.length)) + total + "\n")
        p.doubleHeight(false)
        p.bold(false)
        p.font(BODY_FONT)
        p.rule('=', safeW)
        p.feed(1)
        p.align(1)
        p.text("- - - -  TEAR HERE  - - - -\n")
        p.feed(TEAR_FEED_LINES)
        return p.bytes()
    }

    private fun ruler(n: Int): String = buildString { for (i in 1..n) append(if (i % 10 == 0) ((i / 10) % 10).toString()[0] else if (i % 5 == 0) '+' else '.') }

    // ── Formatting helpers (same rules as escpos.ts) ──

    private fun padRight(s: String, w: Int) = if (s.length >= w) s.substring(0, w) else s + " ".repeat(w - s.length)

    /** Never truncates. */
    private fun padLeft(s: String, w: Int) = if (s.length >= w) s else " ".repeat(w - s.length) + s

    /** Left and right on one line; if they don't fit, the right part goes on its own line. */
    private fun twoColumns(left: String, right: String, w: Int): String =
        if (left.length + right.length + 1 <= w) left + " ".repeat(w - left.length - right.length) + right + "\n"
        else left + "\n" + padLeft(right, w) + "\n"

    private fun commas(n: Int) = String.format(Locale.US, "%,d", n)

    /** Word-wrap to [w]; a word longer than a line is split. Never drops text. */
    private fun wrap(str: String, w: Int): List<String> {
        val lines = mutableListOf<String>()
        var current = ""
        for (raw in str.trim().split(Regex("\\s+"))) {
            var word = raw
            while (word.length > w) {
                if (current.isNotEmpty()) { lines += current; current = "" }
                lines += word.substring(0, w)
                word = word.substring(w)
            }
            if (word.isEmpty()) continue
            current = when {
                current.isEmpty() -> word
                current.length + 1 + word.length <= w -> "$current $word"
                else -> { lines += current; word }
            }
        }
        if (current.isNotEmpty() || lines.isEmpty()) lines += current
        return lines
    }

    private val ASCII_REPLACEMENTS = mapOf(
        '‘' to "'", '’' to "'", '“' to "\"", '”' to "\"",
        '–' to "-", '—' to "-", '•' to "*", '·' to ".",
        '×' to "x", '…' to "...", ' ' to " ", '₨' to "Rs",
    )

    /** Printable ASCII only: a byte >= 0x80 can swallow the next ESC/POS command byte. */
    private fun ascii(str: String): ByteArray {
        val sb = StringBuilder()
        val normalized = Normalizer.normalize(str, Normalizer.Form.NFKD)
        var i = 0
        while (i < normalized.length) {
            val cp = normalized.codePointAt(i)
            i += Character.charCount(cp)
            when {
                cp < 0x80 -> sb.append(cp.toChar())
                cp <= 0xFFFF && ASCII_REPLACEMENTS.containsKey(cp.toChar()) -> sb.append(ASCII_REPLACEMENTS[cp.toChar()])
                Character.getType(cp) == Character.NON_SPACING_MARK.toInt() -> Unit
                else -> sb.append('?')
            }
        }
        return sb.toString().toByteArray(Charsets.US_ASCII)
    }

    // ── Command buffer ──

    private class Buf {
        private val out = ByteArrayOutputStream()
        fun bytes(): ByteArray = out.toByteArray()
        fun raw(vararg v: Int) = v.forEach { out.write(it) }
        fun text(s: String) = out.write(ascii(s))

        /** ESC @ reset; FS . cancels Chinese double-byte mode. */
        fun initialize() = raw(0x1B, 0x40, 0x1C, 0x2E)
        fun font(f: Char) = raw(0x1B, 0x4D, if (f == 'A') 0 else 1)
        fun printWidth(dots: Int) = raw(0x1D, 0x57, dots and 0xFF, (dots shr 8) and 0xFF)
        /** 0 left, 1 centre, 2 right */
        fun align(n: Int) = raw(0x1B, 0x61, n)
        fun bold(on: Boolean) = raw(0x1B, 0x45, if (on) 1 else 0)
        fun doubleWidth(on: Boolean) = raw(0x1D, 0x21, if (on) 0x10 else 0)
        fun doubleHeight(on: Boolean) = raw(0x1D, 0x21, if (on) 0x01 else 0)
        fun doubleSize(on: Boolean) = raw(0x1D, 0x21, if (on) 0x11 else 0)
        fun feed(n: Int) = raw(0x1B, 0x64, n.coerceIn(0, 255))
        fun blank(n: Int) { if (n > 0) feed(minOf(3, n)) }

        fun rule(c: Char, w: Int) { bold(true); text(c.toString().repeat(w) + "\n"); bold(false) }

        fun sep(style: String, w: Int) {
            when (style) {
                "none" -> Unit
                "dash" -> { bold(true); text("- ".repeat(w).substring(0, w).trimEnd() + "\n"); bold(false) }
                "=", "-" -> rule(style[0], w)
                else -> Unit
            }
        }

        /** Centred bold heading in Font A, double width when it fits; else wrapped body font. Leaves alignment centred. */
        fun heading(str: String, size: String) {
            val safeA = COLUMNS
            align(1)
            bold(true)
            if (size == "xlarge" && str.length * 2 <= safeA) {
                font('A'); doubleWidth(true); text(str + "\n"); doubleWidth(false)
            } else if (size != "normal" && str.length <= safeA) {
                font('A'); text(str + "\n")
            } else {
                font(BODY_FONT); text(wrap(str, COLUMNS).joinToString("\n") + "\n")
            }
            bold(false)
            font(BODY_FONT)
        }
    }
}
