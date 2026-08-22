package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.fold4.MainViewModel
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.core.Mode
import com.jarvis.fold4.ui.components.ChipState
import com.jarvis.fold4.ui.components.GlassPanel
import com.jarvis.fold4.ui.components.HudCore
import com.jarvis.fold4.ui.components.MetricRow
import com.jarvis.fold4.ui.components.StatusChip
import com.jarvis.fold4.ui.theme.JarvisColors
import java.util.Calendar

/**
 * Home — reflows between COVER (compact single column) and UNFOLDED
 * (full command center with context rails). The core canvas stays centered;
 * panels appear/disappear with animated size transitions.
 */
@Composable
fun HomeScreen(vm: MainViewModel, isUnfolded: Boolean, onNavigate: (String) -> Unit) {
    val state by JarvisCore.state.collectAsState()
    val messages by vm.messages.collectAsState()
    val pending by vm.pendingConfirmation.collectAsState()

    Box(Modifier.fillMaxSize().background(JarvisColors.Bg0)) {
        HudCore(compact = !isUnfolded)

        Column(Modifier.fillMaxSize()) {
            TopBar(isUnfolded)
            if (isUnfolded) {
                Row(Modifier.fillMaxSize().weight(1f)) {
                    LeftRail(Modifier.width(232.dp).fillMaxHeight())
                    CenterZone(vm, Modifier.weight(1f), onNavigate)
                    RightRail(Modifier.width(250.dp).fillMaxHeight())
                }
            } else {
                CenterZone(vm, Modifier.fillMaxSize().weight(1f), onNavigate, compact = true)
            }
            ConversationBar(vm, messages, Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun TopBar(isUnfolded: Boolean) {
    val state by JarvisCore.state.collectAsState()
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(7.dp).height(7.dp).background(JarvisColors.Blue, androidx.compose.foundation.shape.CircleShape))
            Spacer(Modifier.width(8.dp))
            Text("JARVIS", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, fontSize = 13.sp, letterSpacing = 5.sp)
        }
        StatusChip("ONLINE", ChipState.OK)
        if (isUnfolded) {
            StatusChip("SYSTEM READY", if (state.device.batteryPct != null) ChipState.OK else ChipState.WARN)
            StatusChip("VOICE", if (state.voice.listening) ChipState.BUSY else ChipState.OK)
            StatusChip("VISION", if (state.vision.active) ChipState.BUSY else ChipState.IDLE)
            StatusChip("NET", if (state.device.online) ChipState.OK else ChipState.ERR)
        } else {
            StatusChip("FOLDED", ChipState.IDLE)
        }
    }
}

@Composable
private fun LeftRail(modifier: Modifier = Modifier) {
    val state by JarvisCore.state.collectAsState()
    Column(modifier.padding(12.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        GlassPanel("Temporal") {
            val cal = Calendar.getInstance()
            Text(
                "%02d:%02d".format(cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE)),
                color = JarvisColors.Text, fontFamily = FontFamily.Monospace, fontSize = 26.sp,
            )
            Text(java.text.DateFormat.getDateInstance(java.text.DateFormat.LONG).format(cal.time), color = JarvisColors.TextDim, fontSize = 12.sp)
        }
        GlassPanel("Device") {
            state.device.batteryPct?.let {
                MetricRow("Battery", "$it%${if (state.device.charging == true) " ⚡" else ""}",
                    if (it <= 20) JarvisColors.Red else if (it <= 40) JarvisColors.Amber else JarvisColors.Green)
            } ?: MetricRow("Battery", "unavailable", JarvisColors.TextFaint)
            MetricRow("Network", state.device.networkType ?: "—", if (state.device.online) JarvisColors.Green else JarvisColors.Red)
            MetricRow("Form factor", if (state.device.folded) "cover" else "unfolded")
        }
        GlassPanel("Focus") {
            Text(
                if (state.focusMode) "ACTIVE — minimal alerts" else "Inactive",
                color = if (state.focusMode) JarvisColors.Amber else JarvisColors.TextFaint,
                fontFamily = FontFamily.Monospace, fontSize = 11.sp,
            )
        }
        GlassPanel("Memory") {
            MetricRow("Entries", "${state.memoryCount}")
            MetricRow("Engine", state.providerId)
        }
    }
}

@Composable
private fun RightRail(modifier: Modifier = Modifier) {
    val state by JarvisCore.state.collectAsState()
    Column(modifier.padding(12.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        GlassPanel("AI Modules") {
            MetricRow("Voice engine", if (state.voice.listening) "listening" else "standby", if (state.voice.listening) JarvisColors.Blue else JarvisColors.Text)
            MetricRow("Vision model", if (state.vision.active) "live" else "standby", if (state.vision.active) JarvisColors.Cyan else JarvisColors.Text)
            MetricRow("AI engine", state.providerId)
            MetricRow("Memory index", "${state.memoryCount} entries")
            MetricRow("Automation", "watching", JarvisColors.Green)
        }
        GlassPanel("Telemetry") {
            state.device.batteryPct?.let { MetricRow("Battery", "$it%") }
            state.device.storageUsedGb?.let { MetricRow("Storage", "$it GB used") }
            state.device.ramMb?.let { MetricRow("RAM", "${it / 1024} GB") }
            state.device.temperatureC?.let { MetricRow("Temp", "${it.toInt()}°C") }
            MetricRow("Mode", state.mode.name.lowercase(), if (state.mode != Mode.IDLE) JarvisColors.Blue else JarvisColors.Text)
        }
        GlassPanel("Security") {
            MetricRow("Provider keys", "encrypted at rest", JarvisColors.Green)
            MetricRow("Biometrics", "local only", JarvisColors.Green)
            MetricRow("Telemetry", "off", JarvisColors.Green)
        }
    }
}

@Composable
private fun CenterZone(vm: MainViewModel, modifier: Modifier = Modifier, onNavigate: (String) -> Unit, compact: Boolean = false) {
    val state by JarvisCore.state.collectAsState()
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        if (!compact) {
            Text(
                state.mode.name.uppercase(),
                color = JarvisColors.TextFaint,
                fontFamily = FontFamily.Monospace,
                fontSize = 10.sp,
                letterSpacing = 4.sp,
            )
            Spacer(Modifier.height(10.dp))
        }
        Text(
            when (state.mode) {
                Mode.LISTENING -> "LISTENING…"
                Mode.THINKING -> "THINKING…"
                Mode.SPEAKING -> "SPEAKING…"
                Mode.VISION -> "SCANNING…"
                else -> "VOICE · VISION · MEMORY"
            },
            color = if (state.mode == Mode.IDLE) JarvisColors.TextFaint else JarvisColors.BlueSoft,
            fontFamily = FontFamily.Monospace,
            fontSize = 9.sp,
            letterSpacing = 3.sp,
        )
    }
}

@Composable
private fun ConversationBar(vm: MainViewModel, messages: List<MainViewModel.Message>, modifier: Modifier = Modifier) {
    Column(modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
        // last messages
        if (messages.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().height(120.dp).verticalScroll(rememberScrollState())) {
                messages.takeLast(4).forEach { m ->
                    Text(
                        "${if (m.role == "user") "▸ " else "◂ "}${m.text}",
                        color = if (m.role == "user") JarvisColors.TextDim else JarvisColors.Text,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(vertical = 3.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ControlButton("VOICE") { vm.processCommand("what can you do") }
            ControlButton("VISION") { vm.processCommand("open vision mode") }
            ControlButton("MEMORY") { vm.processCommand("show my memories") }
            ControlButton("AUTO") { vm.processCommand("create a routine") }
            ControlButton("SYSTEM") { vm.processCommand("show system status") }
            ControlButton("SETTINGS") { vm.processCommand("open settings") }
        }
    }
}

@Composable
private fun ControlButton(label: String, onClick: () -> Unit) {
    androidx.compose.material3.TextButton(onClick = onClick) {
        Text(label, color = JarvisColors.TextDim, fontFamily = FontFamily.Monospace, fontSize = 10.sp, letterSpacing = 1.6.sp)
    }
}
