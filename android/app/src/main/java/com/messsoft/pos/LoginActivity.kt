package com.messsoft.pos

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject

class LoginActivity : ComponentActivity() {
    private lateinit var session: Session

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = Session(this)
        SunmiPrinter.bind(this)

        if (session.token != null) {
            openPos()
            return
        }

        setContentView(R.layout.activity_login)
        val server = findViewById<EditText>(R.id.server)
        val email = findViewById<EditText>(R.id.email)
        val password = findViewById<EditText>(R.id.password)
        val signIn = findViewById<Button>(R.id.signIn)
        val error = findViewById<TextView>(R.id.error)

        server.setText(session.server)
        email.setText(session.email)
        if (session.email.isNotEmpty()) password.requestFocus()

        fun submit() {
            val url = Session.normalizeServer(server.text.toString())
            val mail = email.text.toString().trim()
            val pass = password.text.toString()
            error.visibility = View.GONE
            when {
                mail.isEmpty() || pass.isEmpty() -> return showError(error, "Enter your email and password.")
                url.isEmpty() -> return showError(error, "Enter the server address (the web app's address).")
            }
            session.server = url
            session.email = mail
            server.setText(url)
            signIn.isEnabled = false
            signIn.text = "Signing in…"
            lifecycleScope.launch {
                try {
                    val res = Api(session).post("/login", JSONObject().put("email", mail).put("password", pass)) as JSONObject
                    val user = res.getJSONObject("user")
                    val perms = user.optJSONArray("permissions")?.let { a -> (0 until a.length()).map { a.getString(it) }.toSet() } ?: emptySet()
                    if ("sales:create" !in perms) {
                        showError(error, "${user.optString("name")} doesn't have permission to make sales.")
                        return@launch
                    }
                    session.signIn(res.getString("token"), user.optInt("id"), user.optString("name"), perms)
                    openPos()
                } catch (e: ApiException) {
                    showError(error, e.message ?: "Sign-in failed")
                } finally {
                    signIn.isEnabled = true
                    signIn.text = "Sign in"
                }
            }
        }

        signIn.setOnClickListener { submit() }
        password.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) { submit(); true } else false
        }
    }

    private fun showError(view: TextView, message: String) {
        view.text = message
        view.visibility = View.VISIBLE
    }

    private fun openPos() {
        startActivity(Intent(this, PosActivity::class.java))
        finish()
    }
}
