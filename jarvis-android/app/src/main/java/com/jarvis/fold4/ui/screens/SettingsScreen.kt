package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import com.jarvis.fold4.ai.AiProvider
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.memory.MemoryRepository
import com.jarvis.fold4.ui.components.GlassPanel
import com.jarvis.fold4.ui.theme.JarvisColors
import kotlinx.coroutines.launch

/** Settings — voice, AI providers (BYOK), environment, accessibility, data. */
@Composable
fun SettingsScreen() {
    val app = remember { JarvisApp.instance }
    val scope = rememberCoroutineScope()
    var prefs by remember { mutableStateOf(MemoryRepository.UserPrefs()) }
    var providers by remember { mutableStateOf(app.providers.list()) }
    var openaiKey by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        prefs = app.memory.preferences()
    }

    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("SETTINGS", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp, fontSize = 13.sp)

        GlassPanel("Assistant") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Name: ${prefs.assistantName}", color = JarvisColors.Text, fontSize = 13.sp)
                Text("User: ${prefs.userName.ifBlank { "—" }}", color = JarvisColors.TextDim, fontSize = 13.sp)
            }
        }

        GlassPanel("Voice") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Wake word \"Jarvis\"", color = JarvisColors.TextDim, fontSize = 12.sp)
                Switch(checked = prefs.wakeWordEnabled, onCheckedChange = {
                    scope.launch { app.memory.setPref("voice.wakeWord", it.toString()); prefs = app.memory.preferences() }
                })
            }
            Text("Wake word uses the platform recognizer (battery cost, mic permission). Off by default.", color = JarvisColors.TextFaint, fontSize = 10.sp)
        }

        GlassPanel("AI Engine") {
            providers.forEach { p ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        "${if (p.kind == AiProvider.Kind.LOCAL) "◈" else "☁"} ${p.label} — ${if (p.kind == AiProvider.Kind.LOCAL) "ON-DEVICE" else if (p.isConfigured()) "CONFIGURED" else "NO KEY"}",
                        color = if (prefs.providerId == p.id) JarvisColors.BlueSoft else JarvisColors.TextDim,
                        fontSize = 11.sp,
                    )
                    TextButton(onClick = {
                        scope.launch {
                            app.memory.setPref("provider.id", p.id)
                            JarvisCore.patch { it.copy(providerId = p.id) }
                            prefs = app.memory.preferences()
                        }
                    }) { Text("USE", color = JarvisColors.TextFaint, fontSize = 9.sp) }
                }
            }
            Text("API keys are encrypted with the Android Keystore (AES-256-GCM) and only sent to the provider you choose. Nothing is hard-coded.", color = JarvisColors.TextFaint, fontSize = 10.sp)
            OutlinedTextField(
                openaiKey, { openaiKey = it },
                label = { Text("OpenAI-compatible API key") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            TextButton(onClick = {
                scope.launch {
                    if (openaiKey.isNotBlank()) {
                        app.secretStore.putKey("openai", openaiKey)
                        providers = app.providers.list()
                    }
                }
            }) { Text("SAVE KEY (ENCRYPTED)", color = JarvisColors.BlueSoft, fontSize = 9.sp) }
        }

        GlassPanel("Accessibility") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Reduced motion", color = JarvisColors.TextDim, fontSize = 12.sp)
                Switch(checked = prefs.reducedMotion, onCheckedChange = {
                    scope.launch { app.memory.setPref("a11y.reducedMotion", it.toString()); prefs = app.memory.preferences() }
                })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("High contrast", color = JarvisColors.TextDim, fontSize = 12.sp)
                Switch(checked = prefs.highContrast, onCheckedChange = {
                    scope.launch { app.memory.setPref("a11y.highContrast", it.toString()); prefs = app.memory.preferences() }
                })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Haptics", color = JarvisColors.TextDim, fontSize = 12.sp)
                Switch(checked = prefs.hapticsEnabled, onCheckedChange = {
                    scope.launch { app.memory.setPref("haptics.enabled", it.toString()); prefs = app.memory.preferences() }
                })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Sounds", color = JarvisColors.TextDim, fontSize = 12.sp)
                Switch(checked = prefs.soundsEnabled, onCheckedChange = {
                    scope.launch { app.memory.setPref("sounds.enabled", it.toString()); prefs = app.memory.preferences() }
                })
            }
        }

        GlassPanel("Biometrics") {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Speaker recognition (experimental)", color = JarvisColors.TextDim, fontSize = 12.sp)
                Switch(checked = prefs.speakerIdEnabled, onCheckedChange = {
                    scope.launch { app.memory.setPref("privacy.speakerId", it.toString()); prefs = app.memory.preferences() }
                })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Face recognition (experimental)", color = JarvisColors.TextDim, fontSize = 12.sp)
                Switch(checked = prefs.faceIdEnabled, onCheckedChange = {
                    scope.launch { app.memory.setPref("privacy.faceId", it.toString()); prefs = app.memory.preferences() }
                })
            }
        }

        GlassPanel("Environment") {
            Text("Weather city: ${prefs.city.ifBlank { "not set (geolocation optional)" }}", color = JarvisColors.TextDim, fontSize = 12.sp)
            Text("Units: ${prefs.units}", color = JarvisColors.TextDim, fontSize = 12.sp)
        }

        GlassPanel("Danger zone") {
            TextButton(onClick = { scope.launch { app.memory.wipe() } }) { Text("WIPE MEMORY", color = JarvisColors.Red, fontSize = 9.sp) }
            TextButton(onClick = { scope.launch { app.secretStore.destroyAll() } }) { Text("FORGET ALL API KEYS", color = JarvisColors.Red, fontSize = 9.sp) }
        }
    }
}
