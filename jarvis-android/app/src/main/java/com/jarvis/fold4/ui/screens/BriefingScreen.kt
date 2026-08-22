package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.ui.components.GlassPanel
import com.jarvis.fold4.ui.theme.JarvisColors
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

/** Smart Briefing — time, weather placeholder (from WeatherService cache),
 *  power, reminders, routines, focus. Every card is real data or honest N/A. */
@Composable
fun BriefingScreen() {
    val state by JarvisCore.state.collectAsState()
    val d = state.device

    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("SMART BRIEFING", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp, fontSize = 13.sp)
        Text(DateFormat.getDateInstance(DateFormat.LONG).format(Date()), color = JarvisColors.TextFaint, fontSize = 11.sp)

        GlassPanel("Time") {
            val cal = Calendar.getInstance()
            Text("%02d:%02d".format(cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE)), color = JarvisColors.Text, fontFamily = FontFamily.Monospace, fontSize = 26.sp)
        }
        GlassPanel("Power") {
            d.batteryPct?.let {
                Text("$it% ${if (d.charging == true) "· charging" else ""}", color = if (it <= 20) JarvisColors.Red else JarvisColors.Text, fontFamily = FontFamily.Monospace, fontSize = 16.sp)
            } ?: Text("UNAVAILABLE", color = JarvisColors.TextFaint)
        }
        GlassPanel("Network") {
            Text(if (d.online) "Online${d.networkType?.let { " — $it" } ?: ""}" else "Offline — Offline Intelligence Mode active", color = if (d.online) JarvisColors.Green else JarvisColors.Amber, fontSize = 13.sp)
        }
        GlassPanel("Focus") {
            Text(if (state.focusMode) "Active — alerts suppressed" else "Inactive", color = if (state.focusMode) JarvisColors.Amber else JarvisColors.TextDim, fontSize = 13.sp)
        }
    }
}
