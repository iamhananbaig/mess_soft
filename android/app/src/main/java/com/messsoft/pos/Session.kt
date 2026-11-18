package com.messsoft.pos

import android.content.Context

/** Signed-in cashier and server address, kept across app restarts. */
class Session(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("session", Context.MODE_PRIVATE)

    var server: String
        get() = prefs.getString("server", "") ?: ""
        set(value) = prefs.edit().putString("server", value).apply()

    var email: String
        get() = prefs.getString("email", "") ?: ""
        set(value) = prefs.edit().putString("email", value).apply()

    val token: String? get() = prefs.getString("token", null)
    val userName: String get() = prefs.getString("user_name", "") ?: ""
    /** 0 for sessions saved before the id was stored; filled from /me. */
    var userId: Int
        get() = prefs.getInt("user_id", 0)
        set(value) = prefs.edit().putInt("user_id", value).apply()
    val permissions: Set<String> get() = prefs.getStringSet("permissions", emptySet()) ?: emptySet()

    /** Last completed sale on this device, for "Reprint last receipt". */
    var lastSaleId: Int
        get() = prefs.getInt("last_sale_id", 0)
        set(value) = prefs.edit().putInt("last_sale_id", value).apply()

    /** When the app last asked GitHub for an update (ms). */
    var lastUpdateCheck: Long
        get() = prefs.getLong("last_update_check", 0)
        set(value) = prefs.edit().putLong("last_update_check", value).apply()

    val apiBase: String get() = server.trimEnd('/') + "/api/v1"

    fun can(permission: String) = permission in permissions

    fun signIn(token: String, userId: Int, userName: String, permissions: Set<String>) {
        prefs.edit()
            .putString("token", token)
            .putInt("user_id", userId)
            .putString("user_name", userName)
            .putStringSet("permissions", permissions)
            .apply()
    }

    fun signOut() {
        prefs.edit().remove("token").remove("user_id").remove("user_name").remove("permissions").remove("last_sale_id").apply()
    }

    companion object {
        /** "pos.example.com" → "https://pos.example.com"; drops a trailing /api/v1 or slash. */
        fun normalizeServer(input: String): String {
            var s = input.trim().trimEnd('/')
            if (s.isEmpty()) return s
            if (!s.startsWith("http://", ignoreCase = true) && !s.startsWith("https://", ignoreCase = true)) s = "https://$s"
            return s.removeSuffix("/api/v1").removeSuffix("/api").trimEnd('/')
        }
    }
}
