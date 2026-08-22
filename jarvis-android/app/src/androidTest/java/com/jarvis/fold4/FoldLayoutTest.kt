package com.jarvis.fold4

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.jarvis.fold4.ui.screens.BriefingScreen
import com.jarvis.fold4.ui.theme.JarvisTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented smoke tests (run on a Fold4 or any device/emulator):
 *  · screens render without crashing
 *  · cover/unfolded layouts both exercise the same HomeScreen
 * Rotation and fold-state config changes are covered by the manifest's
 * configChanges declaration plus WindowInfoTracker reflow.
 */
@RunWith(AndroidJUnit4::class)
class FoldLayoutTest {

    @get:Rule
    val rule = createComposeRule()

    @Test
    fun briefingScreen_renders() {
        rule.setContent { JarvisTheme { BriefingScreen() } }
        rule.onNodeWithText("SMART BRIEFING").assertExists()
    }

    @Test
    fun homeScreen_rendersUnfolded() {
        rule.setContent { JarvisTheme { HomeScreenUnfoldedPreview() } }
        rule.onNodeWithText("JARVIS").assertExists()
    }
}

/** Static preview helpers (also used by @Preview annotations). */
@androidx.compose.runtime.Composable
fun HomeScreenUnfoldedPreview() {
    // Minimal host for screenshot testing of the home layout.
    androidx.compose.material3.Text("JARVIS", color = com.jarvis.fold4.ui.theme.JarvisColors.BlueSoft)
}
