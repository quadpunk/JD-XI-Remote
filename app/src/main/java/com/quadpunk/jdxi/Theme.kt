package com.quadpunk.jdxi

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class Palette(
    val dark: Boolean, val bg: Color, val surface: Color, val surface2: Color, val line: Color,
    val inset: Color, val insetAlt: Color, val text: Color, val textLo: Color,
    val d1: Color, val d2: Color, val dr: Color, val an: Color, val accent: Color,
)

private fun c(h: Long) = Color(0xFF000000 or h)

/** One palette per theme of the web app's Appearance menu (same names), so the native sequencer follows the chosen theme. */
val PALETTES: Map<String, Palette> = mapOf(
    "droid" to Palette(true, c(0x121319), c(0x1A1C24), c(0x20232D), c(0x2D313E), c(0x16181F), c(0x0F1015), c(0xE8EAF0), c(0x98A0B3),
        c(0x30B5D1), c(0xFFB02E), c(0xFF5A5F), c(0x6FD08C), c(0xFFB02E)),
    "fm1" to Palette(true, c(0x0A1413), c(0x0E1B1A), c(0x12231F), c(0x2A4F4B), c(0x0C1817), c(0x08100F), c(0xCFE6E1), c(0x7FA39C),
        c(0x7FE3D1), c(0xF2B94B), c(0xFF6F6A), c(0x3F9C90), c(0xF2B94B)),
    "studio" to Palette(false, c(0xDEDED7), c(0xF6F5EF), c(0xE7E7DF), c(0xAAA99E), c(0xECEAE1), c(0xDCDBD1), c(0x242721), c(0x52564D),
        c(0x2869A5), c(0xA76406), c(0xC04B3E), c(0x368368), c(0xB9390B)),
    "pocket" to Palette(true, c(0x171B19), c(0x232824), c(0x343B35), c(0x586159), c(0x1C211D), c(0x141814), c(0xECEFE6), c(0xBDC5B9),
        c(0xC3D891), c(0xA0BD78), c(0xD9DB95), c(0x8EAA7C), c(0xD8E991)),
    "dark" to Palette(true, c(0x171C20), c(0x262D32), c(0x30383E), c(0x46535B), c(0x1E252A), c(0x151A1E), c(0xE1E7E9), c(0x9CAEB8),
        c(0x30B5D1), c(0xF3A91D), c(0xE33F43), c(0x6FD08C), c(0xF3A91D)),
    "light" to Palette(false, c(0xF4F7FB), c(0xFFFFFF), c(0xE3EBF2), c(0x9EAEBF), c(0xE8EFF5), c(0xD9E3EC), c(0x182332), c(0x425468),
        c(0x1789AC), c(0xD97A00), c(0xD0453F), c(0x2F9A55), c(0xD97A00)),
    // KO palettes mirror the web UI's v39 --ui-* tokens. Without these, the native
    // Step Sequencer falls back to the Android palette even though the WebView switches.
    "ko-light" to Palette(false,
        c(0xEBE7DE), c(0xF6F2E9), c(0xDFDACD), c(0xAAA397),
        c(0xC9CEAD), c(0xE1DCCF), c(0x252723), c(0x4D5049),
        c(0x2869A5), c(0xA76406), c(0xB33C20), c(0x368368), c(0xB33C20)),
    "ko-dark" to Palette(true,
        c(0x212326), c(0x303237), c(0x292B2F), c(0x64666C),
        c(0x202327), c(0x17191C), c(0xF3EFE8), c(0xD1CBC1),
        c(0x66B9D9), c(0xFFCB77), c(0xFF805B), c(0x80CDA5), c(0xFF805B)),
    "ocean" to Palette(true, c(0x061D2B), c(0x0B3040), c(0x103B4D), c(0x28788C), c(0x082636), c(0x051A26), c(0xE0F8FF), c(0x8FC3D3),
        c(0x4FD1E8), c(0xFFC857), c(0xFF7A6E), c(0x6FD7A0), c(0xFFC857)),
)

/** Current colours. `theme` is set from the web page whenever the Appearance menu changes. */
object Jd {
    var theme by mutableStateOf("droid")
    val palette: Palette get() = PALETTES[theme] ?: PALETTES.getValue("droid")
    val bg get() = palette.bg
    val surface get() = palette.surface
    val surface2 get() = palette.surface2
    val line get() = palette.line
    val inset get() = palette.inset
    val insetAlt get() = palette.insetAlt
    val text get() = palette.text
    val textLo get() = palette.textLo
    val d1 get() = palette.d1    // Digital 1
    val d2 get() = palette.d2    // Digital 2
    val dr get() = palette.dr    // Drums
    val an get() = palette.an    // Analog
}

val C_SEQ: Color get() = Jd.palette.accent
val C_FILTER: Color get() = Jd.dr

fun onFill(c: Color): Color = if (c.luminance() > 0.5f) Color(0xFF14161C) else Color.White
fun jdBtn(): Shape = RoundedCornerShape(10.dp)
fun jdShape(r: Dp): Shape = RoundedCornerShape(r)
fun jdBorder(): BorderStroke = BorderStroke(1.dp, Jd.line)
fun toast(ctx: Context, msg: String) = Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()

@Composable
fun JdTheme(content: @Composable () -> Unit) {
    val p = Jd.palette
    val scheme = if (p.dark) darkColorScheme(
        primary = p.accent, onPrimary = onFill(p.accent),
        secondary = p.d1, background = p.bg, onBackground = p.text,
        surface = p.surface, onSurface = p.text, surfaceVariant = p.surface2, onSurfaceVariant = p.textLo,
        outline = p.line,
    ) else lightColorScheme(
        primary = p.accent, onPrimary = onFill(p.accent),
        secondary = p.d1, background = p.bg, onBackground = p.text,
        surface = p.surface, onSurface = p.text, surfaceVariant = p.surface2, onSurfaceVariant = p.textLo,
        outline = p.line,
    )
    MaterialTheme(colorScheme = scheme, content = content)
}

/** Row of numbered pattern slots. Switch between Load and Save with the chip. */
@Composable
fun SlotRow(
    title: String, count: Int, label: (Int) -> String?,
    onLoad: (Int) -> Unit, onSave: (Int) -> Unit, accent: Color,
) {
    var saving by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, fontSize = 11.sp, letterSpacing = 1.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FilterChip(selected = saving, onClick = { saving = !saving }, label = { Text(if (saving) "Tap a slot to SAVE" else "Tap a slot to load") })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (i in 0 until count) {
                val used = label(i) != null
                OutlinedButton(
                    onClick = { if (saving) onSave(i) else onLoad(i) },
                    shape = jdBtn(),
                    contentPadding = PaddingValues(0.dp),
                    border = BorderStroke(if (used) 2.dp else 1.dp, if (used) accent else Jd.line),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = if (used) accent else Jd.textLo),
                    modifier = Modifier.weight(1f).height(40.dp),
                ) { Text("${i + 1}", fontSize = 14.sp) }
            }
        }
    }
}
