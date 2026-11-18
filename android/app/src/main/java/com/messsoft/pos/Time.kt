package com.messsoft.pos

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** The canteen's clock: everything is shown in Asia/Karachi, whatever the device is set to. */
object Time {
    val KARACHI: TimeZone = TimeZone.getTimeZone("Asia/Karachi")

    private fun fmt(pattern: String) = SimpleDateFormat(pattern, Locale.US).apply { timeZone = KARACHI }

    /** API date parameter, e.g. 2026-11-18 */
    fun ymd(date: Date): String = fmt("yyyy-MM-dd").format(date)

    /** 18-Nov-2026, as on receipts */
    fun day(date: Date): String = fmt("dd-MMM-yyyy").format(date)

    /** Wed, 18 Nov 2026 */
    fun dayLong(date: Date): String = fmt("EEE, d MMM yyyy").format(date)

    fun dayTime(date: Date): String = fmt("dd-MMM-yyyy hh:mm a").format(date)

    /** "2026-11-18T07:24:56.000000Z" (UTC) or a zone-less local string → Date. */
    fun parse(iso: String): Date? {
        if (iso.length < 19) return null
        val utc = iso.endsWith("Z") || iso.endsWith("z")
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = if (utc) TimeZone.getTimeZone("UTC") else KARACHI
        }
        return runCatching { parser.parse(iso.substring(0, 19).replace(' ', 'T')) }.getOrNull()
    }

    /** → "12:24 PM" */
    fun clock(iso: String): String = parse(iso)?.let { fmt("hh:mm a").format(it) } ?: ""

    /** → "18-Nov 12:24 PM" */
    fun shortDayClock(iso: String): String = parse(iso)?.let { fmt("dd-MMM hh:mm a").format(it) } ?: ""
}
