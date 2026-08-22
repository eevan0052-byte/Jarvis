package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.fold4.JarvisApp
import com.jarvis.fold4.ui.components.HudCore
import com.jarvis.fold4.ui.theme.JarvisColors
import kotlinx.coroutines.launch

/**
 * Onboarding — 8 cinematic steps (welcome, name, voice enroll, face enroll,
 * permissions, personalization, first routine, entry). Every optional step is
 * skippable; permissions are requested with purpose explanations.
 */
@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    val app = remember { JarvisApp.instance }
    val scope = rememberCoroutineScope()
    var step by remember { mutableIntStateOf(0) }
    var assistantName by remember { mutableStateOf("JARVIS") }
    var userName by remember { mutableStateOf("") }
    var style by remember { mutableStateOf("balanced") }
    var template by remember { mutableStateOf("Low battery alert") }

    val steps = listOf(
        "Welcome", "Assistant name", "Voice enrollment", "Face enrollment",
        "Permissions", "Personalization", "First routine", "Systems ready",
    )

    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        HudCore(Modifier.fillMaxWidth().padding(vertical = 24.dp), compact = true)

        Text("${step + 1} / ${steps.size} — ${steps[step].uppercase()}", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 3.sp, fontSize = 13.sp)

        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (step) {
                0 -> Text(
                    "I am a personal AI operating layer for your Fold.\nVoice, vision, memory and automation — working together, on-device, under your control.",
                    color = JarvisColors.TextDim, fontSize = 13.sp,
                )
                1 -> OutlinedTextField(assistantName, { assistantName = it }, label = { Text("Assistant name") }, singleLine = true)
                2 -> Text(
                    "Optional: enroll your voice so I can recognize who is speaking. Honest scope: an acoustic voiceprint (pitch/energy profile), not a security biometric. Encrypted, local-only.",
                    color = JarvisColors.TextDim, fontSize = 12.sp,
                )
                3 -> Text(
                    "Optional: enroll your face for instant personalization. Landmark templates only (eye/nose/mouth geometry). Encrypted, local, never uploaded. Not used for security.",
                    color = JarvisColors.TextDim, fontSize = 12.sp,
                )
                4 -> Text(
                    "Microphone: voice commands. Camera: Vision Mode only, with a visible indicator. Notifications: reminders. Location: weather — or set a city instead. Everything can be revoked in the Privacy Center.",
                    color = JarvisColors.TextDim, fontSize = 12.sp,
                )
                5 -> {
                    OutlinedTextField(userName, { userName = it }, label = { Text("Your name (optional)") }, singleLine = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("brief", "balanced", "verbose").forEach { s ->
                            TextButton(onClick = { style = s }) {
                                Text(s.uppercase(), color = if (style == s) JarvisColors.BlueSoft else JarvisColors.TextFaint, fontFamily = FontFamily.Monospace, fontSize = 9.sp)
                            }
                        }
                    }
                }
                6 -> {
                    listOf("Low battery alert", "Evening wind-down", "Back online").forEach { t ->
                        TextButton(onClick = { template = t }) {
                            Text(if (template == t) "● $t" else "○ $t", color = if (template == t) JarvisColors.BlueSoft else JarvisColors.TextDim, fontSize = 12.sp)
                        }
                    }
                }
                else -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("VOICE", "VISION", "CONTEXT", "MEMORY").forEach { s ->
                        Text("$s READY", color = JarvisColors.Green, fontFamily = FontFamily.Monospace, fontSize = 10.sp, letterSpacing = 1.5.sp)
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (step > 0) TextButton(onClick = { step-- }) { Text("BACK", color = JarvisColors.TextFaint, fontFamily = FontFamily.Monospace) }
            TextButton(onClick = {
                if (step == steps.size - 1) {
                    scope.launch {
                        app.memory.setPref("assistant.name", assistantName)
                        if (userName.isNotBlank()) app.memory.setPref("user.name", userName)
                        app.memory.setPref("user.style", style)
                        app.memory.setPref("onboarding.done", "true")
                        onDone()
                    }
                } else step++
            }) {
                Text(if (step == steps.size - 1) "ENTER JARVIS" else "CONTINUE", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 2.sp)
            }
            if (step > 0 && step < steps.size - 1) TextButton(onClick = { step++ }) { Text("SKIP", color = JarvisColors.TextFaint, fontFamily = FontFamily.Monospace) }
        }
    }
}
