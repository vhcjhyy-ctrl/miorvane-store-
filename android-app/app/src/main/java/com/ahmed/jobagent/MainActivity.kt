package com.ahmed.jobagent

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var loadingView: LinearLayout
    private lateinit var errorView: LinearLayout
    private lateinit var progress: ProgressBar
    private var pageFailed = false

    private val startUri: Uri by lazy { Uri.parse(BuildConfig.APP_BASE_URL) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        root = FrameLayout(this)
        root.setBackgroundColor(Color.rgb(248, 250, 252))

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            CookieManager.getInstance().setAcceptCookie(true)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url ?: return false
                    val scheme = uri.scheme?.lowercase()
                    if (scheme == "https" || scheme == "http") {
                        val host = uri.host?.lowercase().orEmpty()
                        val baseHost = startUri.host?.lowercase().orEmpty()
                        val isAppHost = host == baseHost
                        val isSupabaseHost = host == "supabase.co" || host.endsWith(".supabase.co")
                        if (isAppHost || isSupabaseHost) return false
                        return try {
                            startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                            true
                        } catch (_: Exception) {
                            false
                        }
                    }
                    if (scheme == "mailto" || scheme == "tel") {
                        return try {
                            startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                            true
                        } catch (_: Exception) {
                            true
                        }
                    }
                    return true
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    pageFailed = false
                    showLoading()
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    if (!pageFailed) {
                        loadingView.visibility = View.GONE
                        errorView.visibility = View.GONE
                        webView.visibility = View.VISIBLE
                    }
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
                        pageFailed = true
                        showError()
                    }
                }
            }
        }

        loadingView = makeMessageView(
            title = getString(R.string.app_name),
            message = getString(R.string.loading_message),
            showProgress = true
        )

        errorView = makeMessageView(
            title = getString(R.string.connection_error_title),
            message = getString(R.string.connection_error_message),
            showProgress = false
        ).apply {
            val retry = Button(this@MainActivity).apply {
                text = getString(R.string.retry)
                setOnClickListener {
                    if (hasNetworkConnection()) {
                        pageFailed = false
                        showLoading()
                        webView.reload()
                    } else {
                        showError()
                    }
                }
            }
            addView(retry)
        }
        errorView.visibility = View.GONE

        root.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        root.addView(loadingView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        root.addView(errorView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        setContentView(root)

        if (hasNetworkConnection()) {
            webView.loadUrl(BuildConfig.APP_BASE_URL)
        } else {
            showError()
        }
    }

    private fun makeMessageView(title: String, message: String, showProgress: Boolean): LinearLayout {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(32, 32, 32, 32)
            setBackgroundColor(Color.rgb(248, 250, 252))
        }

        if (showProgress) {
            progress = ProgressBar(this)
            container.addView(progress)
        }

        container.addView(TextView(this).apply {
            text = title
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(15, 23, 42))
            gravity = Gravity.CENTER
            setPadding(0, 20, 0, 10)
        })

        container.addView(TextView(this).apply {
            text = message
            textSize = 15f
            setTextColor(Color.rgb(71, 85, 105))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        })

        return container
    }

    private fun showLoading() {
        loadingView.visibility = View.VISIBLE
        errorView.visibility = View.GONE
        webView.visibility = View.INVISIBLE
    }

    private fun showError() {
        loadingView.visibility = View.GONE
        errorView.visibility = View.VISIBLE
        webView.visibility = View.INVISIBLE
    }

    private fun hasNetworkConnection(): Boolean {
        val manager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    @Deprecated("Deprecated in Android API; retained for compatible WebView navigation.")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
