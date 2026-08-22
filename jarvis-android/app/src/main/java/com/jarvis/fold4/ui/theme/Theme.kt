package com.jarvis.fold4.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * JARVIS visual language — deep graphite, electric blue, cyan highlights,
 * white technical typography. Original identity (inspired by the HUD
 * philosophy of sci-fi assistants, not a copy of any interface).
 */
object JarvisColors {
    val Bg0 = Color(0xFF04070D)
    val Bg1 = Color(0xFF070C15)
    val Bg2 = Color(0xFF0B1322)
    val Panel = Color(0xBA0A1220)
    val Line = Color(0x246EB4FF)
    val LineStrong = Color(0x4782C8FF)
    val Blue = Color(0xFF57B8FF)
    val BlueSoft = Color(0xFF8FD0FF)
    val Cyan = Color(0xFF46E0E8)
    val Amber = Color(0xFFFFB454)
    val Red = Color(0xFFFF6B6B)
    val Green = Color(0xFF5FE8A0)
    val Text = Color(0xFFDFE9F5)
    val TextDim = Color(0xFF8FA3BD)
    val TextFaint = Color(0xFF51637D)
}

private val DarkScheme = darkColorScheme(
    primary = JarvisColors.Blue,
    onPrimary = Color.Black,
    secondary = JarvisColors.Cyan,
    background = JarvisColors.Bg0,
    surface = JarvisColors.Bg2,
    onBackground = JarvisColors.Text,
    onSurface = JarvisColors.Text,
    error = JarvisColors.Red,
)

val JarvisTypography = Typography(
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 13.sp, lineHeight = 20.sp, color = JarvisColors.TextDim),
    labelSmall = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, letterSpacing = 1.6.sp, color = JarvisColors.TextFaint),
    titleMedium = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, letterSpacing = 3.sp, color = JarvisColors.BlueSoft),
    titleLarge = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 20.sp, letterSpacing = 6.sp, fontWeight = FontWeight.Normal, color = JarvisColors.BlueSoft),
)

@Composable
fun JarvisTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkScheme,
        typography = JarvisTypography,
        content = content,
    )
}
