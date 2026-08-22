package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.fold4.JarvisApp
import com.jarvis.fold4.automation.AutomationEngine
import com.jarvis.fold4.ui.components.GlassPanel
import com.jarvis.fold4.ui.theme.JarvisColors
import kotlinx.coroutines.launch

/** Automation Engine UI — user-authored IF→THEN rules with auto-run opt-in. */
@Composable
fun AutomationScreen() {
    val app = remember { JarvisApp.instance }
    val engine = remember { AutomationEngine(app.memory) }
    val scope = rememberCoroutineScope()
    var rules by remember { mutableStateOf(emptyList<AutomationEngine.Rule>()) }
    var editorOpen by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { rules = engine.listRules() }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("AUTOMATION ENGINE", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp, fontSize = 13.sp)
            Text("IF condition → THEN suggestion / action. Consequential actions always ask unless you enable auto-run.", color = JarvisColors.TextFaint, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
        }
        items(rules, key = { it.id }) { r ->
            GlassPanel(r.name.uppercase()) {
                Text(
                    "IF ${r.whenType} ${r.whenParams.values.joinToString(" ")} → ${if (r.thenKind == "action") "run ${r.thenAction}" else "${r.thenKind}: ${r.thenMessage ?: ""}"}",
                    color = JarvisColors.TextDim, fontFamily = FontFamily.Monospace, fontSize = 10.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Row(Modifier.fillMaxWidth()) {
                    Text(
                        if (r.autoRun) "AUTO-RUN (authorized)" else "CONFIRM FIRST",
                        color = if (r.autoRun) JarvisColors.Amber else JarvisColors.Green,
                        fontFamily = FontFamily.Monospace, fontSize = 9.sp,
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { scope.launch { engine.toggle(r.id, !r.enabled); rules = engine.listRules() } }) {
                            Text(if (r.enabled) "DISABLE" else "ENABLE", color = JarvisColors.TextFaint, fontSize = 9.sp)
                        }
                        TextButton(onClick = { scope.launch { engine.setAutoRun(r.id, !r.autoRun); rules = engine.listRules() } }) {
                            Text(if (r.autoRun) "UN-AUTO" else "AUTO-RUN", color = JarvisColors.TextFaint, fontSize = 9.sp)
                        }
                        TextButton(onClick = { scope.launch { engine.delete(r.id); rules = engine.listRules() } }) {
                            Text("DELETE", color = JarvisColors.Red, fontSize = 9.sp)
                        }
                    }
                }
            }
        }
        item {
            Row {
                TextButton(onClick = { editorOpen = true }) { Text("+ NEW ROUTINE", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 2.sp) }
            }
        }
    }

    if (editorOpen) {
        var name by remember { mutableStateOf("") }
        var time by remember { mutableStateOf("22:30") }
        var batteryLevel by remember { mutableStateOf("20") }
        var kind by remember { mutableStateOf("time") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { editorOpen = false },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        val rule = when (kind) {
                            "battery" -> AutomationEngine.Rule("", name.ifBlank { "Battery rule" }, true, false, "battery", mapOf("op" to "below", "level" to batteryLevel), "action", AutomationEngine.ACTION_BATTERY_SAVER, null, 0)
                            else -> AutomationEngine.Rule("", name.ifBlank { "Evening routine" }, true, false, "time", mapOf("time" to time), "suggest", null, "Time for your routine.", 0)
                        }
                        engine.save(rule)
                        rules = engine.listRules()
                        editorOpen = false
                    }
                }) { Text("SAVE", color = JarvisColors.BlueSoft) }
            },
            title = { Text("New routine", color = JarvisColors.Text) },
            text = {
                Column {
                    OutlinedTextField(name, { name = it }, label = { Text("Name") })
                    Row(Modifier.padding(top = 8.dp)) {
                        TextButton(onClick = { kind = "time" }) { Text("TIME", color = if (kind == "time") JarvisColors.BlueSoft else JarvisColors.TextFaint) }
                        TextButton(onClick = { kind = "battery" }) { Text("BATTERY", color = if (kind == "battery") JarvisColors.BlueSoft else JarvisColors.TextFaint) }
                    }
                    if (kind == "time") OutlinedTextField(time, { time = it }, label = { Text("HH:MM") })
                    else OutlinedTextField(batteryLevel, { batteryLevel = it }, label = { Text("Battery below %") })
                }
            },
        )
    }
}
