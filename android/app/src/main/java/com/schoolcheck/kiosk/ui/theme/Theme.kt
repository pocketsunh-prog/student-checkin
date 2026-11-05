package com.schoolcheck.kiosk.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The kiosk is always dark: it hangs in a hallway and must stay readable in all light.
 */
private val KioskColorScheme = darkColorScheme(
    primary = KioskGreen,
    onPrimary = Color(0xFF04231A),
    primaryContainer = Color(0xFF0F3B2E),
    onPrimaryContainer = KioskGreen,
    secondary = KioskBlue,
    onSecondary = Color(0xFF06182E),
    secondaryContainer = Color(0xFF14294A),
    onSecondaryContainer = KioskBlue,
    background = BackgroundDark,
    onBackground = TextPrimary,
    surface = SurfaceDark,
    onSurface = TextPrimary,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = TextSecondary,
    error = KioskRed,
    onError = Color(0xFF2B0707),
    errorContainer = Color(0xFF401414),
    onErrorContainer = Color(0xFFFFD7D7),
    outline = OutlineDark,
)

@Composable
fun SchoolCheckTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KioskColorScheme,
        typography = KioskTypography,
        content = content,
    )
}
