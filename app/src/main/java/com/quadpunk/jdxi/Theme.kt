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

/** Colours taken from the web app's default "droid" theme so both halves of the app look the same. */
object Jd {
    val bg = Color(0xFF121319)
    val surface = Color(0xFF1A1C24)
    val surface2 = Color(0xFF20232D)
    val line = Color(0xFF2D313E)
    val inset = Color(0xFF16181F)
    val insetAlt = Color(0xFF0F1015)
    val text = Color(0xFFE8EAF0)
    val textLo = Color(0xFF98A0B3)
    val d1 = Color(0xFF30B5D1)    // Digital 1
    val d2 = Color(0xFFFFB02E)    // Digital 2
    val dr = Color(0xFFFF5A5F)    // Drums
    val an = Color(0xFF6FD08C)    // Analog
}

val C_SEQ = Color(0xFFFFB02E)
val C_FILTER = Color(0xFFFF5A5F)

fun onFill(c: Color): Color = if (c.luminance() > 0.5f) Color(0xFF14161C) else Color.White
fun jdBtn(): Shape = RoundedCornerShape(10.dp)
fun jdShape(r: Dp): Shape = RoundedCornerShape(r)
fun jdBorder(): BorderStroke = BorderStroke(1.dp, Jd.line)
fun toast(ctx: Context, msg: String) = Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()

@Composable
fun JdTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Jd.d2, onPrimary = Color(0xFF14161C),
            secondary = Jd.d1, background = Jd.bg, onBackground = Jd.text,
            surface = Jd.surface, onSurface = Jd.text, surfaceVariant = Jd.surface2, onSurfaceVariant = Jd.textLo,
            outline = Jd.line,
        ),
        content = content,
    )
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
