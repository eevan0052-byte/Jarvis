package com.jarvis.fold4.ui.screens

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.ui.theme.JarvisColors
import com.jarvis.fold4.vision.VisionEngine

/**
 * Vision Mode — CameraX feed with the scanning HUD. Camera runs ONLY while
 * this screen is composed; a red REC indicator is always visible. Honest
 * fallbacks: permission denied → explanation; detector missing → degraded
 * scene statistics, clearly labeled.
 */
@Composable
fun VisionScreen(onClose: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by JarvisCore.state.collectAsState()
    val engine = remember { VisionEngine(context) }

    var hasPermission by remember { androidx.compose.runtime.mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasPermission = granted
    }
    val requestPermission: () -> Unit = {
        permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    // Probe permission on composition.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        hasPermission = context.checkSelfPermission(Manifest.permission.CAMERA) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    DisposableEffect(Unit) {
        onDispose {
            engine.shutdown()
            if (JarvisCore.state.value.mode == com.jarvis.fold4.core.Mode.VISION) {
                JarvisCore.setMode(com.jarvis.fold4.core.Mode.IDLE)
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        val previewView = remember { PreviewView(context) }
        AndroidView(
            factory = { previewView },
            modifier = Modifier.fillMaxSize(),
        )

        androidx.compose.runtime.LaunchedEffect(hasPermission) {
            if (hasPermission) {
                try {
                    engine.start(previewView, lifecycleOwner)
                } catch (e: Exception) {
                    JarvisCore.updateVision { it.copy(error = e.message) }
                }
            }
        }

        // ── HUD ──
        if (state.vision.active) {
            Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
                ) {
                    Text("VISION MODE", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp, fontSize = 12.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(7.dp).background(JarvisColors.Red, androidx.compose.foundation.shape.CircleShape))
                        Text(" REC", color = JarvisColors.Red, fontFamily = FontFamily.Monospace, fontSize = 10.sp, modifier = Modifier.padding(start = 5.dp))
                    }
                }
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                // detection boxes (scaled to preview area)
                Box(Modifier.fillMaxWidth().padding(horizontal = 10.dp)) {
                    state.vision.detections.take(3).forEach { d ->
                        Text(
                            "▣ ${d.label} · ${(d.score * 100).toInt()}%",
                            color = JarvisColors.Cyan,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp,
                            modifier = Modifier.padding(vertical = 2.dp),
                        )
                    }
                }
                Row(Modifier.fillMaxWidth().padding(14.dp)) {
                    TextButton(onClick = onClose) {
                        Text("CLOSE VISION", color = JarvisColors.Red, fontFamily = FontFamily.Monospace, fontSize = 11.sp, letterSpacing = 2.sp)
                    }
                }
            }
        } else if (state.vision.error != null) {
            Text(
                "Vision service unavailable: ${state.vision.error}. Local scene statistics remain available.",
                color = JarvisColors.Amber,
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                fontSize = 13.sp,
            )
        } else if (!hasPermission) {
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Camera permission required", color = JarvisColors.Text, fontSize = 15.sp)
                Text("JARVIS uses the camera only while Vision Mode is open, with a visible indicator. Frames are analyzed on-device and never uploaded.", color = JarvisColors.TextDim, fontSize = 12.sp, modifier = Modifier.padding(20.dp))
                TextButton(onClick = requestPermission) {
                    Text("GRANT CAMERA", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 2.sp)
                }
                TextButton(onClick = onClose) { Text("CLOSE", color = JarvisColors.TextFaint, fontFamily = FontFamily.Monospace) }
            }
        }
    }
}
