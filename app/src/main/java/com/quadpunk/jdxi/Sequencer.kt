package com.quadpunk.jdxi

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.locks.LockSupport
import kotlin.math.max

/** A single note in the step grid. step = 0-based step index, len = length in steps. */
data class StepNote(val step: Int, val key: Int, val vel: Int, val len: Int)

class SeqTrack(val id: Int, val name: String, val channel: Int, val drum: Boolean) {
    val notes = mutableStateListOf<StepNote>()
    var mute by mutableStateOf(false)
}

/** JD-Xi drum pads, MIDI keys 36..73 */
val DRUM_PADS = listOf(
    "BD1", "RIM", "BD2", "CLAP", "BD3", "SD1", "CHH", "SD2", "PHH", "SD3", "OHH", "SD4", "TOM1",
    "PRC1", "TOM2", "PRC2", "TOM3", "PRC3", "CYM1", "PRC4", "CYM2", "PRC5", "CYM3", "HIT", "OTH1", "OTH2",
    "D4", "Eb4", "E4", "F4", "F#4", "G4", "G#4", "A4", "Bb4", "B4", "C5", "C#5",
)

private val NOTE_NAMES = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
fun noteName(key: Int) = NOTE_NAMES[key % 12] + (key / 12 - 1)

/**
 * 4-track step sequencer running on the phone, mirroring the JD-Xi pattern sequencer layout
 * (Digital 1, Digital 2, Drums, Analog). Plays the synth over MIDI and can send MIDI clock.
 * Resolution: 96 pulses per quarter note, 24 pulses per 16th step.
 */
class Sequencer(val engine: MidiEngine, ctx: Context) {
    val tracks = listOf(
        SeqTrack(0, "Digital 1", 0, false),
        SeqTrack(1, "Digital 2", 1, false),
        SeqTrack(2, "Drums", 9, true),
        SeqTrack(3, "Analog", 2, false),
    )
    var bpm by mutableIntStateOf(120)
    var swing by mutableIntStateOf(0)          // 0..66 (%)
    var length by mutableIntStateOf(16)        // 16, 32, 48, 64
    var sendClock by mutableStateOf(false)
    var playing by mutableStateOf(false)
        private set
    var step by mutableIntStateOf(-1)
        private set

    val slotUsed = mutableStateListOf(false, false, false, false, false, false, false, false)

    /** -1 = all tracks; otherwise only this track id is played (used when recording into the JD-Xi). */
    var soloTrack by mutableIntStateOf(-1)
    @Volatile private var stopAfterPulses = 0L
    private var restoreClock: Boolean? = null

    @Volatile private var running = false
    private var thread: Thread? = null
    private val prefs = ctx.getSharedPreferences("patterns", Context.MODE_PRIVATE)

    init {
        for (i in 0..7) slotUsed[i] = prefs.contains("slot$i")
        loadFrom("cur")
    }

    // ───── editing ─────

    fun toggle(t: SeqTrack, s: Int, key: Int, vel: Int, len: Int) {
        val ex = t.notes.firstOrNull { it.step == s && it.key == key }
        if (ex != null) t.notes.remove(ex)
        else {
            t.notes.add(StepNote(s, key, vel, if (t.drum) 1 else len))
            if (!playing) engine.audition(t.channel, key, vel)
        }
        saveTo("cur")
    }

    fun clearTrack(t: SeqTrack) { t.notes.clear(); saveTo("cur") }
    fun clearAll() { tracks.forEach { it.notes.clear() }; saveTo("cur") }

    // ───── transport ─────

    fun start() {
        if (running) return
        thread?.join(300)   // make sure a previous loop has fully ended
        running = true
        playing = true
        thread = Thread {
            try { loop() } finally { playing = false; step = -1; stopAfterPulses = 0; soloTrack = -1; restoreClock?.let { sendClock = it }; restoreClock = null }
        }.apply { priority = Thread.MAX_PRIORITY; isDaemon = true; start() }
    }

    fun stop() { running = false; saveTo("cur") }

    /**
     * Play the pattern once through for [bars] bars with MIDI Start + clock, so that a JD-Xi that is
     * armed for recording (Sync Mode = SLAVE) records it. solo = track id or -1 for all tracks.
     */
    fun recordPass(bars: Int, solo: Int) {
        if (running) return
        restoreClock = sendClock
        sendClock = true
        soloTrack = solo
        stopAfterPulses = bars * 16 * 24L
        start()
    }

    private fun noteOn(ch: Int, key: Int, vel: Int) = byteArrayOf((0x90 or ch).toByte(), key.toByte(), vel.toByte())
    private fun noteOff(ch: Int, key: Int) = byteArrayOf((0x80 or ch).toByte(), key.toByte(), 0)

    private fun loop() {
        if (sendClock) engine.send(byteArrayOf(0xFA.toByte()))   // MIDI Start
        var pulse = 0L
        var next = System.nanoTime()
        val offs = ArrayList<LongArray>()   // [duePulse, channel, key]
        while (running) {
            val patPulses = length * 24L
            if (stopAfterPulses > 0 && pulse >= stopAfterPulses) break
            val p = (pulse % patPulses).toInt()
            if (sendClock && pulse % 4L == 0L) engine.send(byteArrayOf(0xF8.toByte()))

            val iter = offs.iterator()
            while (iter.hasNext()) {
                val o = iter.next()
                if (o[0] <= pulse) { engine.send(noteOff(o[1].toInt(), o[2].toInt())); iter.remove() }
            }

            val s = p / 24
            val r = p % 24
            val swingP = swing * 24 / 100
            val trig = if (s % 2 == 0) r == 0 else r == swingP
            if (trig) {
                step = s
                for (t in tracks) {
                    if (t.mute || (soloTrack >= 0 && t.id != soloTrack)) continue
                    for (n in t.notes.filter { it.step == s }) {
                        engine.send(noteOn(t.channel, n.key, n.vel))
                        offs.add(longArrayOf(pulse + max(2, (n.len * 24 * 0.9).toInt()).toLong(), t.channel.toLong(), n.key.toLong()))
                    }
                }
            }
            pulse++
            next += 60_000_000_000L / (bpm.coerceAtLeast(20) * 96L)
            var now = System.nanoTime()
            while (running && now < next) {
                LockSupport.parkNanos(minOf(next - now, 2_000_000L))
                now = System.nanoTime()
            }
        }
        // release hanging notes
        for (o in offs) engine.send(noteOff(o[1].toInt(), o[2].toInt()))
        for (t in tracks) engine.send(byteArrayOf((0xB0 or t.channel).toByte(), 123, 0))
        if (sendClock) engine.send(byteArrayOf(0xFC.toByte()))   // MIDI Stop
    }

    // ───── pattern slots (stored on the phone) ─────

    private fun toJson(): String {
        val o = JSONObject()
        o.put("bpm", bpm); o.put("swing", swing); o.put("len", length)
        val ta = JSONArray()
        for (t in tracks) {
            val to = JSONObject()
            to.put("mute", t.mute)
            val na = JSONArray()
            for (n in t.notes) na.put(JSONArray().put(n.step).put(n.key).put(n.vel).put(n.len))
            to.put("notes", na)
            ta.put(to)
        }
        o.put("tracks", ta)
        return o.toString()
    }

    private fun loadFrom(key: String): Boolean {
        val s = prefs.getString(key, null) ?: return false
        return try {
            val o = JSONObject(s)
            bpm = o.optInt("bpm", 120)
            swing = o.optInt("swing", 0)
            length = o.optInt("len", 16)
            val ta = o.getJSONArray("tracks")
            for (i in tracks.indices) {
                val to = ta.optJSONObject(i) ?: continue
                tracks[i].mute = to.optBoolean("mute", false)
                tracks[i].notes.clear()
                val na = to.getJSONArray("notes")
                for (k in 0 until na.length()) {
                    val a = na.getJSONArray(k)
                    tracks[i].notes.add(StepNote(a.getInt(0), a.getInt(1), a.getInt(2), a.getInt(3)))
                }
            }
            true
        } catch (e: Exception) { false }
    }

    private fun saveTo(key: String) { prefs.edit().putString(key, toJson()).apply() }

    fun saveSlot(i: Int) { saveTo("slot$i"); slotUsed[i] = true }
    fun loadSlot(i: Int): Boolean = loadFrom("slot$i").also { if (it) saveTo("cur") }
}
