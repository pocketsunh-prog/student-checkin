package com.schoolcheck.kiosk.ui.kiosk

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.schoolcheck.kiosk.data.model.ScanHistoryEntry
import com.schoolcheck.kiosk.ui.theme.BackgroundDark
import com.schoolcheck.kiosk.ui.theme.SurfaceDark
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val timeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val dayFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM")

/** Last 10 scans, kept locally; images are never stored, only result metadata. */
@Composable
fun RecentScansPanel(entries: List<ScanHistoryEntry>, onDismiss: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 24.dp, vertical = 20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Recent scans",
                        style = MaterialTheme.typography.headlineLarge,
                        color = Color.White,
                    )
                    Text(
                        text = "Last ${entries.size} on this kiosk · stored on this device only",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.6f),
                    )
                }
                TextButton(onClick = onDismiss) { Text("Close") }
            }
            Spacer(Modifier.height(16.dp))

            if (entries.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No scans yet.\nPoint the camera at a student and tap Scan.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.6f),
                        textAlign = TextAlign.Center,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(entries) { entry -> HistoryRow(entry) }
                }
            }
        }
    }
}

@Composable
private fun HistoryRow(entry: ScanHistoryEntry) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceDark),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entry.fullName.ifBlank { "Unknown student" },
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val identity = buildList {
                    if (entry.studentId.isNotBlank()) add(entry.studentId)
                    entry.className?.takeIf { it.isNotBlank() }?.let { add("Class $it") }
                }.joinToString(" · ")
                if (identity.isNotBlank()) {
                    Text(
                        text = identity,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.6f),
                    )
                }
                val action = buildList {
                    add(actionLabel(entry.action))
                    statusText(entry.status, entry.lateMinutes)?.let { add(it) }
                }.joinToString(" · ")
                Text(
                    text = action,
                    style = MaterialTheme.typography.bodyMedium,
                    color = actionColor(entry.action),
                )
            }
            Text(
                text = formatWhen(entry.atMillis),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White.copy(alpha = 0.75f),
            )
        }
    }
}

private fun formatWhen(millis: Long): String {
    val zoned = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault())
    return if (zoned.toLocalDate() == LocalDate.now()) {
        zoned.format(timeFormatter)
    } else {
        "${zoned.format(dayFormatter)} ${zoned.format(timeFormatter)}"
    }
}
