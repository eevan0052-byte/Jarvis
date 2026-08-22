package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.fold4.JarvisApp
import com.jarvis.fold4.privacy.PrivacyCenter
import com.jarvis.fold4.ui.components.GlassPanel
import com.jarvis.fold4.ui.theme.JarvisColors
import kotlinx.coroutines.launch

/** Privacy Center — what JARVIS can access, live permission state, wipe. */
@Composable
fun PrivacyScreen() {
    val context = LocalContext.current
    val app = remember { context.applicationContext as JarvisApp }
    val privacy = remember { PrivacyCenter(context) }
    var caps by remember { mutableStateOf(privacy.capabilities()) }
    var audit by remember { mutableStateOf<List<String>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        caps = privacy.capabilities()
        audit = app.audit.recent(40).map { "[${java.text.DateFormat.getTimeInstance().format(it.createdAt)}] ${it.title} ${it.body}" }
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("PRIVACY CENTER", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp, fontSize = 13.sp)
            Text("Exactly what JARVIS can access — you stay in control. Data stays on this device.", color = JarvisColors.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
        }
        items(caps, key = { it.id }) { c ->
            GlassPanel(c.label.uppercase()) {
                Text(c.description, color = JarvisColors.TextDim, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        when (c.state) {
                            PrivacyCenter.Capability.State.GRANTED -> "GRANTED"
                            PrivacyCenter.Capability.State.DENIED -> "DENIED"
                            PrivacyCenter.Capability.State.NOT_ASKED -> "ASK ON USE"
                            PrivacyCenter.Capability.State.UNAVAILABLE -> "UNAVAILABLE"
                        },
                        color = when (c.state) {
                            PrivacyCenter.Capability.State.GRANTED -> JarvisColors.Green
                            PrivacyCenter.Capability.State.DENIED -> JarvisColors.Red
                            else -> JarvisColors.TextFaint
                        },
                        fontFamily = FontFamily.Monospace, fontSize = 10.sp,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    if (c.deleteAction != null) {
                        TextButton(onClick = { scope.launch { c.deleteAction.invoke(); caps = privacy.capabilities() } }) {
                            Text("DELETE DATA", color = JarvisColors.Red, fontSize = 9.sp)
                        }
                    }
                }
            }
        }
        item {
            GlassPanel("Activity audit (local)") {
                audit.forEach { a ->
                    Text(a, color = JarvisColors.TextFaint, fontFamily = FontFamily.Monospace, fontSize = 9.sp, modifier = Modifier.padding(vertical = 2.dp))
                }
                Row {
                    TextButton(onClick = { scope.launch { app.audit.clear(); audit = emptyList() } }) { Text("CLEAR LOG", color = JarvisColors.TextFaint, fontSize = 9.sp) }
                    TextButton(onClick = { scope.launch { app.memory.wipe(); app.secretStore.destroyAll() } }) { Text("WIPE ALL LOCAL DATA", color = JarvisColors.Red, fontSize = 9.sp) }
                }
            }
        }
        item {
            Text(
                "Transparency: audio is processed during voice commands and never written to disk. Camera frames are analyzed on-device and discarded. Biometric templates are encrypted at rest. No analytics SDK, no tracking, no accounts.",
                color = JarvisColors.TextFaint, fontSize = 10.sp, modifier = Modifier.padding(vertical = 10.dp),
            )
        }
    }
}
