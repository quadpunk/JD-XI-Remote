package com.quadpunk.jdxi

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {
    private lateinit var engine: MidiEngine
    private lateinit var seq: Sequencer
    private lateinit var web: WebView
    private var tab by mutableIntStateOf(0)

    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val req = pendingPermission ?: return@registerForActivityResult
        pendingPermission = null
        if (granted) req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else req.deny()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        engine = MidiEngine(applicationContext)
        seq = Sequencer(engine, applicationContext)
        web = buildWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    customView != null -> hideCustomView()
                    tab != 0 -> tab = 0
                    else -> { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
                }
            }
        })

        setContent {
            JdTheme {
                val tablet = LocalConfiguration.current.screenWidthDp >= 720
                Column(Modifier.fillMaxSize().background(Jd.bg).systemBarsPadding().imePadding()) {
                    Box(Modifier.weight(1f).fillMaxWidth()) {
                        // The WebView stays alive (just hidden) while the sequencer tab is open, so the remote keeps its state.
                        AndroidView(
                            factory = { web },
                            modifier = Modifier.fillMaxSize(),
                            update = { it.visibility = if (tab == 0) View.VISIBLE else View.INVISIBLE },
                        )
                        if (tab == 1) {
                            Column(Modifier.fillMaxSize().background(Jd.bg)) {
                                Text(engine.status, fontSize = 12.sp, color = Jd.textLo, modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp))
                                SequencerScreen(seq, tablet)
                            }
                        }
                    }
                    NavigationBar(containerColor = Jd.surface) {
                        val colors = NavigationBarItemDefaults.colors(indicatorColor = Jd.surface2)
                        NavigationBarItem(selected = tab == 0, onClick = { tab = 0 }, colors = colors,
                            icon = { Text("🎛") }, label = { Text("Remote") })
                        NavigationBarItem(selected = tab == 1, onClick = { tab = 1 }, colors = colors,
                            icon = { Text("▦") }, label = { Text("Sequencer") })
                    }
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView {
        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(debuggable)

        // Serves assets/web/* from https://appassets.androidplatform.net/assets/web/* (a secure origin, so fetch, storage and getUserMedia work).
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        return WebView(this).apply {
            setBackgroundColor(0xFF121319.toInt())
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                cacheMode = WebSettings.LOAD_DEFAULT
                setSupportZoom(false)
                textZoom = 100
            }
            addJavascriptInterface(WebMidiBridge(engine, this, ::saveToDownloads), "AndroidMidi")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == "appassets.androidplatform.net") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    return true
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    // Only the visualiser's optional audio analysis asks for anything (microphone / USB audio input).
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources) {
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                        else { pendingPermission = request; micPermission.launch(Manifest.permission.RECORD_AUDIO) }
                    } else request.deny()
                }

                override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = cb
                    return try { filePicker.launch(params.createIntent()); true }
                    catch (e: Exception) { fileCallback = null; false }
                }

                // element.requestFullscreen() (visualiser)
                override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                    if (customView != null) { callback.onCustomViewHidden(); return }
                    customView = view; customCallback = callback
                    (window.decorView as ViewGroup).addView(view, FrameLayout.LayoutParams(-1, -1))
                    WindowInsetsControllerCompat(window, window.decorView).apply {
                        systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                        hide(WindowInsetsCompat.Type.systemBars())
                    }
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)   // replaces navigator.wakeLock
                }

                override fun onHideCustomView() { hideCustomView() }
            }

            loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
        }
    }

    /** Exports from the web app (patch JSON/.syx, captured .mid) end up in the Downloads folder. */
    private fun saveToDownloads(name: String, bytes: ByteArray, mime: String): Boolean {
        val safe = name.replace(Regex("""[\\/:*?"<>|]"""), "_").ifBlank { "file" }
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safe)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return false
                java.io.File(dir, safe).writeBytes(bytes)
            }
            runOnUiThread { toast(this, "Saved: $safe") }
            true
        } catch (e: Exception) { false }
    }

    private fun hideCustomView() {
        val v = customView ?: return
        (window.decorView as ViewGroup).removeView(v)
        customView = null
        customCallback?.onCustomViewHidden(); customCallback = null
        WindowInsetsControllerCompat(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onDestroy() {
        seq.stop()
        web.removeJavascriptInterface("AndroidMidi")
        web.destroy()
        engine.close()
        super.onDestroy()
    }
}
