package com.schoolcheck.kiosk.ui.kiosk

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.schoolcheck.kiosk.ui.theme.KioskAmber
import com.schoolcheck.kiosk.ui.theme.KioskGreen
import com.schoolcheck.kiosk.ui.theme.KioskRed
import com.schoolcheck.kiosk.ui.theme.SurfaceDark
import kotlin.math.roundToInt

/**
 * Full-screen result card shown after every scan. Successful and unmatched scans return
 * to the camera automatically after ~5 s; transport failures stay until retried/dismissed.
 */
@Composable
fun ScanResultOverlay(
    result: ScanResultUi,
    onDismiss: () -> Unit,
    onRetry: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.78f))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) {
                if (result !is ScanResultUi.Failure) onDismiss()
            },
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(0.88f),
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark),
        ) {
            Column(
                modifier = Modifier.padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when (result) {
                    is ScanResultUi.Success -> SuccessContent(result)
                    is ScanResultUi.Unmatched -> UnmatchedContent(result)
                    is ScanResultUi.Failure -> FailureContent(result, onRetry = onRetry, onDismiss = onDismiss)
                }
            }
        }
    }
}

@Composable
private fun SuccessContent(result: ScanResultUi.Success) {
    val color = actionColor(result.action)
    ResultGlyph(symbol = if (result.action == "CHECK_OUT" || result.action == "ALREADY_CHECKED_OUT") "→" else "✓", color = color)
    Text(
        text = actionLabel(result.action),
        style = MaterialTheme.typography.headlineMedium,
        color = color,
        textAlign = TextAlign.Center,
    )
    Text(
        text = result.fullName,
        style = MaterialTheme.typography.displayMedium,
        color = Color.White,
        textAlign = TextAlign.Center,
    )
    val subtitle = buildList {
        if (result.studentId.isNotBlank()) add(result.studentId)
        result.className?.takeIf { it.isNotBlank() }?.let { add("Class $it") }
        result.form?.takeIf { it.isNotBlank() }?.let { add(it) }
    }.joinToString(" · ")
    if (subtitle.isNotBlank()) {
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.75f),
            textAlign = TextAlign.Center,
        )
    }
    statusText(result.status, result.lateMinutes)?.let { status ->
        Text(
            text = status,
            style = MaterialTheme.typography.titleMedium,
            color = if (result.status == "LATE") KioskAmber else KioskGreen,
        )
    }
    result.message?.takeIf { it.isNotBlank() }?.let { message ->
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
        )
    }
    result.confidence?.let { confidence ->
        Text(
            text = "Match confidence ${(confidence * 100).roundToInt()}%",
            style = MaterialTheme.typography.bodySmall,
            color = Color.White.copy(alpha = 0.55f),
        )
    }
    Spacer(Modifier.height(6.dp))
    Text(
        text = "Tap anywhere to continue",
        style = MaterialTheme.typography.bodySmall,
        color = Color.White.copy(alpha = 0.45f),
    )
}

@Composable
private fun UnmatchedContent(result: ScanResultUi.Unmatched) {
    ResultGlyph(symbol = "!", color = KioskAmber)
    Text(
        text = result.title,
        style = MaterialTheme.typography.headlineMedium,
        color = KioskAmber,
        textAlign = TextAlign.Center,
    )
    Text(
        text = result.detail,
        style = MaterialTheme.typography.bodyLarge,
        color = Color.White.copy(alpha = 0.8f),
        textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(6.dp))
    Text(
        text = "Tap anywhere to scan again",
        style = MaterialTheme.typography.bodySmall,
        color = Color.White.copy(alpha = 0.45f),
    )
}

@Composable
private fun FailureContent(result: ScanResultUi.Failure, onRetry: () -> Unit, onDismiss: () -> Unit) {
    ResultGlyph(symbol = "×", color = KioskRed)
    Text(
        text = "Scan not sent",
        style = MaterialTheme.typography.headlineMedium,
        color = KioskRed,
        textAlign = TextAlign.Center,
    )
    Text(
        text = result.message,
        style = MaterialTheme.typography.bodyLarge,
        color = Color.White.copy(alpha = 0.8f),
        textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        if (result.canRetry) {
            Button(
                onClick = onRetry,
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
            ) { Text("Try again") }
        }
        OutlinedButton(
            onClick = onDismiss,
            modifier = Modifier
                .weight(1f)
                .height(56.dp),
        ) { Text("Cancel") }
    }
}

@Composable
private fun ResultGlyph(symbol: String, color: Color) {
    Box(
        modifier = Modifier
            .size(96.dp)
            .background(color.copy(alpha = 0.16f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = symbol, fontSize = 54.sp, color = color)
    }
}
