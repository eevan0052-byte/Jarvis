package com.jarvis.fold4.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.fold4.ui.theme.JarvisColors

/** Glass panel with a technical title. */
@Composable
fun GlassPanel(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .background(JarvisColors.Panel)
            .border(1.dp, JarvisColors.Line, RoundedCornerShape(10.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(JarvisColors.Blue))
            Text(
                title.uppercase(),
                color = JarvisColors.TextDim,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                letterSpacing = 2.2.sp,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        content()
    }
}

/** Status chip with a state dot (ok / warn / err / idle). */
@Composable
fun StatusChip(label: String, state: ChipState = ChipState.IDLE, modifier: Modifier = Modifier) {
    val color = when (state) {
        ChipState.OK -> JarvisColors.Green
        ChipState.WARN -> JarvisColors.Amber
        ChipState.ERR -> JarvisColors.Red
        ChipState.BUSY -> JarvisColors.Blue
        ChipState.IDLE -> JarvisColors.TextFaint
    }
    Row(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0x99080E1A))
            .border(1.dp, JarvisColors.Line, RoundedCornerShape(999.dp))
            .padding(horizontal = 11.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Text(
            label.uppercase(),
            color = JarvisColors.TextDim,
            fontFamily = FontFamily.Monospace,
            fontSize = 9.sp,
            letterSpacing = 1.4.sp,
            modifier = Modifier.padding(start = 7.dp),
        )
    }
}

enum class ChipState { OK, WARN, ERR, BUSY, IDLE }

/** Circular gauge (battery/storage). */
@Composable
fun Gauge(value: Float, color: Color = JarvisColors.Blue, label: String, modifier: Modifier = Modifier) {
    Box(modifier.size(92.dp), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.Canvas(Modifier.size(92.dp)) {
            val stroke = 6.dp.toPx()
            val inset = stroke / 2
            drawArc(
                color = JarvisColors.Line,
                startAngle = 0f, sweepAngle = 360f, useCenter = false,
                topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                size = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke),
                style = androidx.compose.ui.graphics.drawscope.Stroke(stroke),
            )
            drawArc(
                color = color,
                startAngle = -90f, sweepAngle = 360f * value.coerceIn(0f, 1f), useCenter = false,
                topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                size = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke),
                style = androidx.compose.ui.graphics.drawscope.Stroke(stroke),
            )
        }
        Text(label, color = JarvisColors.Text, fontFamily = FontFamily.Monospace, fontSize = 15.sp)
    }
}

/** Key-value telemetry row. */
@Composable
fun MetricRow(key: String, value: String, valueColor: Color = JarvisColors.Text) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(key.uppercase(), color = JarvisColors.TextFaint, fontFamily = FontFamily.Monospace, fontSize = 9.sp, letterSpacing = 1.sp)
        Text(value, color = valueColor, fontFamily = FontFamily.Monospace, fontSize = 10.sp)
    }
}
