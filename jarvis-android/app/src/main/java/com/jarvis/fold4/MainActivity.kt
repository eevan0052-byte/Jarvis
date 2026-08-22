package com.jarvis.fold4

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.jarvis.fold4.automation.AutomationWorker
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.device.SystemInfoCollector
import com.jarvis.fold4.ui.screens.AutomationScreen
import com.jarvis.fold4.ui.screens.BriefingScreen
import com.jarvis.fold4.ui.screens.HomeScreen
import com.jarvis.fold4.ui.screens.MemoryScreen
import com.jarvis.fold4.ui.screens.OnboardingScreen
import com.jarvis.fold4.ui.screens.PrivacyScreen
import com.jarvis.fold4.ui.screens.SettingsScreen
import com.jarvis.fold4.ui.screens.SystemScreen
import com.jarvis.fold4.ui.screens.VisionScreen
import com.jarvis.fold4.ui.theme.JarvisTheme
import kotlinx.coroutines.flow.map

/**
 * MainActivity — fold-aware shell.
 * The Fold4's hinge state (WindowInfoTracker) drives the layout: cover
 * screen → compact HUD; unfolded → full command center. Config changes are
 * declared in the manifest so the transition is a smooth reflow, never a
 * recreate.
 */
class MainActivity : ComponentActivity() {

    private val collector by lazy { SystemInfoCollector(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        collector.start()
        AutomationWorker.schedule(this)

        setContent {
            JarvisTheme {
                val isUnfolded by remember {
                    WindowInfoTracker.getOrCreate(this)
                        .windowLayoutInfo(this)
                        .map(::isUnfolded)
                }.collectAsState(initial = true)

                LaunchedEffect(isUnfolded) {
                    JarvisCore.patch { it.copy(device = it.device.copy(folded = !isUnfolded)) }
                }

                val vm: MainViewModel = viewModel()
                AppRoot(vm, isUnfolded)
            }
        }
    }

    private fun isUnfolded(info: WindowLayoutInfo): Boolean =
        info.displayFeatures
            .filterIsInstance<FoldingFeature>()
            .any { it.state == FoldingFeature.State.FLAT } || info.displayFeatures.isEmpty()
}

@Composable
private fun AppRoot(vm: MainViewModel, isUnfolded: Boolean) {
    val app = remember { JarvisApp.instance }
    var onboardingDone by remember { mutableStateOf<Boolean?>(null) }
    var screen by remember { mutableStateOf("home") }

    LaunchedEffect(Unit) { onboardingDone = app.memory.preferences().onboardingDone }

    when {
        onboardingDone == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        onboardingDone == false -> OnboardingScreen(onDone = { onboardingDone = true })
        screen == "vision" -> VisionScreen(onClose = { screen = "home" })
        screen == "memory" -> MemoryScreen(vm)
        screen == "privacy" -> PrivacyScreen()
        screen == "system" -> SystemScreen()
        screen == "automation" -> AutomationScreen()
        screen == "settings" -> SettingsScreen()
        screen == "briefing" -> BriefingScreen()
        else -> HomeScreen(vm, isUnfolded, onNavigate = { screen = it })
    }

    BackHandler(screen != "home") { screen = "home" }
}
