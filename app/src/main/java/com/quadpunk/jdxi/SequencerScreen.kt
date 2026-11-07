package com.quadpunk.jdxi

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.min
import kotlin.math.roundToInt

private val TRACK_COLORS: List<Color> get() = listOf(Jd.d1, Jd.d2, Jd.dr, Jd.an)

@Composable
fun SequencerScreen(seq: Sequencer, tablet: Boolean) {
    var sel by rememberSaveable { mutableIntStateOf(0) }
    var page by rememberSaveable { mutableIntStateOf(0) }
    var vel by rememberSaveable { mutableIntStateOf(100) }
    var len by rememberSaveable { mutableIntStateOf(1) }
    var base by rememberSaveable { mutableIntStateOf(48) }   // lowest key of the 2-octave roll
    val track = seq.tracks[sel]
    val pages = seq.length / 16
    if (page >= pages) page = pages - 1
    val color = TRACK_COLORS[sel]

    val transport: @Composable () -> Unit = { Transport(seq) }
    val tracksUi: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("TRACKS", fontSize = 11.sp, letterSpacing = 1.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                seq.tracks.forEachIndexed { i, t ->
                    FilterChip(selected = sel == i, onClick = { sel = i }, label = { Text(t.name, fontSize = 12.sp) }, modifier = Modifier.weight(1f))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(selected = track.mute, onClick = { track.mute = !track.mute }, label = { Text("Mute") })
                OutlinedButton(shape = jdBtn(), onClick = { seq.clearTrack(track) }) { Text("Clear track") }
                OutlinedButton(shape = jdBtn(), onClick = { seq.clearAll() }) { Text("Clear all") }
            }
        }
    }
    val tools: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("NEW NOTE", fontSize = 11.sp, letterSpacing = 1.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Velocity", fontSize = 13.sp, modifier = Modifier.weight(1f))
                Text("$vel", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
            Slider(value = vel.toFloat(), onValueChange = { vel = it.roundToInt() }, valueRange = 1f..127f, modifier = Modifier.height(36.dp))
            if (!track.drum) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Length", fontSize = 13.sp, modifier = Modifier.padding(end = 4.dp))
                    listOf(1, 2, 4, 8).forEach { l -> FilterChip(selected = len == l, onClick = { len = l }, label = { Text("$l") }) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Range", fontSize = 13.sp)
                    OutlinedButton(shape = jdBtn(), onClick = { if (base > 12) base -= 12 }) { Text("▼") }
                    Text("${noteName(base)}–${noteName(base + 23)}", fontWeight = FontWeight.Bold)
                    OutlinedButton(shape = jdBtn(), onClick = { if (base < 84) base += 12 }) { Text("▲") }
                }
            }
        }
    }
    val jdxiCard: @Composable () -> Unit = { JdxiSeqCard(seq, sel) }
    val pageChips: @Composable () -> Unit = {
        Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Bar", fontSize = 12.sp)
            for (i in 0 until pages) FilterChip(selected = page == i, onClick = { page = i }, label = { Text("${i + 1}") })
        }
    }

    if (tablet) {
        Row(Modifier.fillMaxSize().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.width(360.dp).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                transport(); tracksUi(); tools(); jdxiCard()
            }
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                pageChips()
                StepGrid(seq, track, page, base, vel, len, color, Modifier.weight(1f).fillMaxWidth())
            }
        }
    } else {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(10.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            transport(); tracksUi(); tools(); pageChips()
            StepGrid(seq, track, page, base, vel, len, color, Modifier.fillMaxWidth().height(430.dp))
            jdxiCard()
        }
    }
}

@Composable
private fun Transport(seq: Sequencer) {
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                shape = jdBtn(),
                onClick = { if (seq.playing) seq.stop() else seq.start() },
                colors = ButtonDefaults.buttonColors(containerColor = if (seq.playing) C_FILTER else C_SEQ, contentColor = onFill(if (seq.playing) C_FILTER else C_SEQ)),
                modifier = Modifier.weight(1f).height(52.dp),
            ) { Text(if (seq.playing) "■  STOP" else "▶  PLAY", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
            OutlinedButton(shape = jdBtn(), onClick = { if (seq.bpm > 40) seq.bpm-- }) { Text("–") }
            Text("${seq.bpm}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            OutlinedButton(shape = jdBtn(), onClick = { if (seq.bpm < 240) seq.bpm++ }) { Text("+") }
        }
        Slider(value = seq.bpm.toFloat(), onValueChange = { seq.bpm = it.roundToInt() }, valueRange = 40f..240f, modifier = Modifier.height(36.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Swing", fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text("${seq.swing}%", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        }
        Slider(value = seq.swing.toFloat(), onValueChange = { seq.swing = it.roundToInt() }, valueRange = 0f..66f, modifier = Modifier.height(36.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Steps", fontSize = 13.sp, modifier = Modifier.padding(end = 4.dp))
            listOf(16, 32, 48, 64).forEach { n -> FilterChip(selected = seq.length == n, onClick = { seq.length = n }, label = { Text("$n") }) }
        }
        FilterChip(selected = seq.sendClock, onClick = { seq.sendClock = !seq.sendClock }, label = { Text("Send MIDI clock + start/stop") })
        if (seq.sendClock) Text(
            "Set the JD-Xi's sync source to external so its own sequencer follows this tempo.",
            fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        SlotRow(
            title = "PATTERN", count = 8,
            label = { if (seq.slotUsed[it]) "saved" else null },
            onLoad = { i -> if (seq.loadSlot(i)) toast(ctx, "Pattern ${i + 1} loaded") else toast(ctx, "Pattern slot ${i + 1} is empty") },
            onSave = { i -> seq.saveSlot(i); toast(ctx, "Saved to pattern ${i + 1}") },
            accent = C_SEQ,
        )
    }
}

/** Piano-roll style step grid. Tap a cell to add/remove a note. */
@Composable
fun StepGrid(seq: Sequencer, track: SeqTrack, page: Int, base: Int, vel: Int, len: Int, color: Color, modifier: Modifier) {
    val rows = if (track.drum) DRUM_PADS.size else 24
    val cellH = 28.dp
    val keyOf = { r: Int -> if (track.drum) 36 + r else base + 23 - r }
    val black = setOf(1, 3, 6, 8, 10)
    Row(modifier.background(Jd.inset, jdShape(12.dp)).verticalScroll(rememberScrollState())) {
        Column(Modifier.width(48.dp)) {
            for (r in 0 until rows) {
                val k = keyOf(r)
                Box(
                    Modifier.height(cellH).fillMaxWidth().background(if (!track.drum && (k % 12) in black) Jd.insetAlt else Jd.surface2),
                    contentAlignment = Alignment.CenterEnd,
                ) {
                    Text(
                        if (track.drum) DRUM_PADS[k - 36] else noteName(k),
                        fontSize = 10.sp, color = Jd.textLo, modifier = Modifier.padding(end = 6.dp)
                    )
                }
            }
        }
        Canvas(
            Modifier.weight(1f).height(cellH * rows)
                .pointerInput(track.id, page, base, vel, len) {
                    detectTapGestures { off ->
                        val colW = size.width / 16f
                        val rowH = size.height / rows.toFloat()
                        val c = (off.x / colW).toInt().coerceIn(0, 15)
                        val r = (off.y / rowH).toInt().coerceIn(0, rows - 1)
                        seq.toggle(track, page * 16 + c, keyOf(r), vel, len)
                    }
                }
        ) {
            val colW = size.width / 16f
            val rowH = size.height / rows
            for (r in 0 until rows) {
                val k = keyOf(r)
                val dark = if (track.drum) r % 2 == 0 else (k % 12) in black
                drawRect(if (dark) Jd.insetAlt else Jd.inset, Offset(0f, r * rowH), Size(size.width, rowH))
            }
            for (c in 0..16) {
                val strong = c % 4 == 0
                drawLine(Jd.text.copy(alpha = if (strong) 0.33f else 0.12f), Offset(c * colW, 0f), Offset(c * colW, size.height), if (strong) 2f else 1f)
            }
            for (n in track.notes) {
                val c = n.step - page * 16
                if (c !in 0..15) continue
                val r = if (track.drum) n.key - 36 else base + 23 - n.key
                if (r !in 0 until rows) continue
                val w = min(n.len, 16 - c) * colW
                drawRoundRect(
                    color.copy(alpha = 0.55f + 0.45f * n.vel / 127f),
                    Offset(c * colW + 1f, r * rowH + 1f), Size(w - 2f, rowH - 2f), CornerRadius(6f)
                )
            }
            if (seq.playing) {
                val c = seq.step - page * 16
                if (c in 0..15) drawRect(Jd.text.copy(alpha = 0.2f), Offset(c * colW, 0f), Size(colW, size.height))
            }
        }
    }
}


/** Control and record into the JD-Xi's own sequencer (it follows MIDI clock and records incoming MIDI). */
@Composable
private fun JdxiSeqCard(seq: Sequencer, trackId: Int) {
    val ctx = LocalContext.current
    val engine = seq.engine
    var bars by rememberSaveable { mutableIntStateOf(2) }
    Card(shape = jdShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = jdBorder()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("JD-XI'S OWN SEQUENCER", fontSize = 11.sp, letterSpacing = 1.2.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "Pattern data can't be written to the JD-Xi over USB, but its sequencer records incoming MIDI and follows " +
                    "MIDI clock. On the JD-Xi, set Sync Mode (SYSTEM: MIDI) to SLAVE first; its tempo then follows this sequencer's BPM.",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(shape = jdBtn(), onClick = { engine.jdxiStart() }, modifier = Modifier.weight(1f)) { Text("Start") }
                OutlinedButton(shape = jdBtn(), onClick = { engine.jdxiStop() }, modifier = Modifier.weight(1f)) { Text("Stop") }
                OutlinedButton(shape = jdBtn(), onClick = { engine.jdxiContinue() }, modifier = Modifier.weight(1f)) { Text("Continue") }
            }

            Text("Record this pattern into the JD-Xi", fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
            Text(
                "1. On the JD-Xi, pick the part and press REC.  2. Tap a button below: the app sends Start, clock and the notes, then stops by itself.",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Bars", fontSize = 13.sp, modifier = Modifier.padding(end = 4.dp))
                listOf(1, 2, 4, 8).forEach { b -> FilterChip(selected = bars == b, onClick = { bars = b }, label = { Text("$b") }) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    shape = jdBtn(),
                    onClick = { seq.recordPass(bars, trackId) },
                    enabled = !seq.playing,
                    modifier = Modifier.weight(1f),
                ) { Text("Record this track") }
                OutlinedButton(
                    shape = jdBtn(),
                    onClick = { seq.recordPass(bars, -1) },
                    enabled = !seq.playing,
                    modifier = Modifier.weight(1f),
                ) { Text("All tracks") }
            }
        }
    }
}
