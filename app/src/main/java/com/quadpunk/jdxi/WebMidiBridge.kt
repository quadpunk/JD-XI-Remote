package com.quadpunk.jdxi

import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.util.concurrent.ConcurrentHashMap

/** Exposed to the page as `window.AndroidMidi`; android-midi.js turns it into navigator.requestMIDIAccess. */
class WebMidiBridge(
    private val engine: MidiEngine,
    private val web: WebView,
    private val save: (name: String, bytes: ByteArray, mime: String) -> Boolean,
    private val pageChanged: (page: String, topHeightPx: Float) -> Unit,
) {
    private val openInputs = ConcurrentHashMap.newKeySet<String>()

    init {
        engine.incoming.add { id, data ->
            if (id in openInputs) {
                val js = "window.__jdxiMidiIn&&window.__jdxiMidiIn('$id','${hex(data)}')"
                web.post { web.evaluateJavascript(js, null) }
            }
        }
        engine.onPortsChanged = { web.evaluateJavascript("window.__jdxiMidiPorts&&window.__jdxiMidiPorts()", null) }
    }

    @JavascriptInterface fun ports(): String = engine.portsJson()

    @JavascriptInterface fun open(id: String): Boolean {
        val ok = engine.openPort(id)
        if (ok && id.startsWith("i:")) openInputs.add(id)
        return ok
    }

    /** Ports are shared with the native sequencer, so closing from the page only stops forwarding input. */
    @JavascriptInterface fun close(id: String) { openInputs.remove(id) }

    @JavascriptInterface fun send(id: String, hex: String, delayMs: Double) {
        engine.sendTo(id, unhex(hex), delayMs)
    }

    /** Called by android-midi.js with the page's current Appearance theme name. */
    @JavascriptInterface fun setTheme(name: String) { web.post { Jd.theme = name } }

    /** Called by android-midi.js when a tab in the page's tab strip is chosen; topHeight = bottom edge of that strip in CSS px. */
    @JavascriptInterface fun pageChanged(page: String, topHeight: Double) {
        web.post { pageChanged(page, topHeight.toFloat()) }
    }

    /** Called by android-midi.js for <a download> links (patch exports, captured MIDI files). */
    @JavascriptInterface fun saveFile(name: String, base64: String, mime: String): Boolean =
        try { save(name, Base64.decode(base64, Base64.DEFAULT), mime) } catch (e: Exception) { false }

    private fun hex(b: ByteArray): String {
        val sb = StringBuilder(b.size * 2)
        for (x in b) { val v = x.toInt() and 0xFF; if (v < 16) sb.append('0'); sb.append(Integer.toHexString(v)) }
        return sb.toString()
    }

    private fun unhex(h: String): ByteArray =
        ByteArray(h.length / 2) { ((Character.digit(h[it * 2], 16) shl 4) or Character.digit(h[it * 2 + 1], 16)).toByte() }
}
