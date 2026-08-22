package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.jarvis.fold4.ui.components.Gauge
import com.jarvis.fold4.ui.components.GlassPanel
import com.jarvis.fold4.ui.components.MetricRow
import com.jarvis.fold4.ui.theme.JarvisColors

/**
 * System Command Center — real telemetry from SystemInfoCollector.
 * Values that the platform does not expose are marked UNAVAILABLE — never
 * fabricated.
 */
@Composable
fun SystemScreen() {
    val state by JarvisCore.state.collectAsState()
    val d = state.device

    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("SYSTEM COMMAND CENTER", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp, fontSize = 13.sp)
        Text("REAL = live Android telemetry · UNAVAILABLE = not exposed by the platform", color = JarvisColors.TextFaint, fontSize = 10.sp)

        GlassPanel("Power — REAL") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                d.batteryPct?.let {
                    Gauge(it / 100f, if (it <= 25) JarvisColors.Amber else JarvisColors.Blue, "$it%")
                } ?: MetricRow("Battery", "UNAVAILABLE", JarvisColors.TextFaint)
                Column {
                    MetricRow("State", if (d.charging == true) "charging" else if (d.charging == false) "discharging" else "—")
                    MetricRow("Temperature", d.temperatureC?.let { "${it.toInt()}°C" } ?: "UNAVAILABLE")
                }
            }
        }

        GlassPanel("Storage — REAL") {
            if (d.storageUsedGb != null && d.storageTotalGb != null) {
                val pct = (d.storageUsedGb / d.storageTotalGb).coerceIn(0f, 1f)
                Gauge(pct, if (pct > 0.85f) JarvisColors.Red else JarvisColors.Blue, "${(pct * 100).toInt()}%")
                MetricRow("Used", "${d.storageUsedGb} GB")
                MetricRow("Total", "${d.storageTotalGb} GB")
            } else MetricRow("Storage", "UNAVAILABLE", JarvisColors.TextFaint)
        }

        GlassPanel("Network — REAL") {
            MetricRow("Status", if (d.online) "ONLINE" else "OFFLINE", if (d.online) JarvisColors.Green else JarvisColors.Red)
            MetricRow("Type", d.networkType ?: "—")
            MetricRow("Offline intelligence", if (d.online) "standby" else "ACTIVE", if (d.online) JarvisColors.Text else JarvisColors.Amber)
        }

        GlassPanel("Compute — REAL") {
            MetricRow("RAM", d.ramMb?.let { "${it / 1024} GB" } ?: "UNAVAILABLE")
            MetricRow("Cores", "${Runtime.getRuntime().availableProcessors()}")
            MetricRow("Fold state", if (d.folded) "cover screen" else "unfolded")
        }

        GlassPanel("AI subsystems") {
            MetricRow("Vision model", if (state.vision.active) "ML Kit · live" else "ML Kit · standby", if (state.vision.active) JarvisColors.Cyan else JarvisColors.Text)
            MetricRow("OCR", "ML Kit text recognizer")
            MetricRow("Face detect", "ML Kit face detector")
            MetricRow("Active engine", state.providerId)
            MetricRow("Memory entries", "${state.memoryCount}")
        }
    }
}
