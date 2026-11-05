package com.schoolcheck.kiosk.ui.setup

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.schoolcheck.kiosk.data.model.AppSettings
import com.schoolcheck.kiosk.data.model.DEFAULT_BASE_URL
import com.schoolcheck.kiosk.ui.theme.KioskAmber
import com.schoolcheck.kiosk.ui.theme.KioskGreen
import com.schoolcheck.kiosk.ui.theme.KioskRed
import com.schoolcheck.kiosk.util.UrlUtils

/**
 * One-time kiosk setup: server URL + device key, with a real health check
 * (`GET /api/kiosk/health`) before saving. Also re-opened from the kiosk gear icon.
 */
@Composable
fun SetupScreen(
    initial: AppSettings,
    isFirstRun: Boolean,
    onSaved: () -> Unit,
    onCancel: (() -> Unit)?,
) {
    val viewModel: SetupViewModel = viewModel(factory = SetupViewModel.Factory)
    val ui by viewModel.ui.collectAsStateWithLifecycle()

    var serverUrl by rememberSaveable { mutableStateOf(initial.baseUrl) }
    var deviceKey by rememberSaveable { mutableStateOf(initial.deviceKey) }
    val keyboard = LocalSoftwareKeyboardController.current

    LaunchedEffect(ui.saved) {
        if (ui.saved) {
            viewModel.consumeSaved()
            onSaved()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 24.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "SchoolCheck",
                    style = MaterialTheme.typography.displayMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = "Kiosk setup",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (onCancel != null) {
                TextButton(onClick = onCancel) { Text("Cancel") }
            }
        }

        Spacer(Modifier.height(12.dp))
        Text(
            text = "Connect this device to the school server. Set this up once; the kiosk " +
                "then opens straight to the camera.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(28.dp))
        OutlinedTextField(
            value = serverUrl,
            onValueChange = {
                serverUrl = it
                viewModel.clearErrors()
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Server base URL") },
            placeholder = { Text(DEFAULT_BASE_URL) },
            singleLine = true,
            isError = ui.urlError != null,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Uri,
                imeAction = ImeAction.Next,
            ),
            supportingText = {
                Text(
                    ui.urlError
                        ?: "Setup server URL: $DEFAULT_BASE_URL\n" +
                        "Same Wi-Fi: http://<school-PC-IP>:3000/api · Emulator: http://10.0.2.2:3000/api",
                )
            },
        )
        Row {
            TextButton(
                onClick = {
                    serverUrl = DEFAULT_BASE_URL
                    viewModel.clearErrors()
                },
            ) { Text("Use setup server URL") }
        }

        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = deviceKey,
            onValueChange = {
                deviceKey = it
                viewModel.clearErrors()
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Device key") },
            placeholder = { Text("demo-kiosk-key-12345") },
            singleLine = true,
            isError = ui.keyError != null,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            supportingText = {
                Text(
                    ui.keyError
                        ?: "Sent as the X-Device-Key header. Create or rotate keys in the " +
                        "admin portal → Devices.",
                )
            },
        )

        Spacer(Modifier.height(8.dp))
        Text(
            text = "Will connect to: ${UrlUtils.normalizeBaseUrl(serverUrl).ifBlank { "—" }}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(24.dp))
        OutlinedButton(
            onClick = {
                keyboard?.hide()
                viewModel.testConnection(serverUrl, deviceKey)
            },
            enabled = !ui.testing && !ui.saving,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            if (ui.testing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = LocalContentColor.current,
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(12.dp))
                Text("Testing…")
            } else {
                Text("Test connection")
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                keyboard?.hide()
                viewModel.save(serverUrl, deviceKey)
            },
            enabled = !ui.testing && !ui.saving,
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp),
        ) {
            if (ui.saving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = LocalContentColor.current,
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(12.dp))
                Text("Saving…")
            } else {
                Text(if (isFirstRun) "Save & start kiosk" else "Save")
            }
        }

        ui.testResult?.let { result ->
            Spacer(Modifier.height(20.dp))
            ConnectionTestCard(result)
        }

        Spacer(Modifier.height(28.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Privacy & security", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Camera frames are sent only to this school server and are never saved " +
                        "to the gallery or this device's storage. The device key identifies " +
                        "this kiosk; anyone with it can submit scans, so rotate it if the " +
                        "tablet goes missing.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Plain HTTP is only for local development. Serve the API over HTTPS in " +
                        "production.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = KioskAmber,
                )
            }
        }
    }
}

@Composable
private fun ConnectionTestCard(result: ConnectionTest) {
    val success = result is ConnectionTest.Success
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (success) KioskGreen.copy(alpha = 0.14f) else KioskRed.copy(alpha = 0.14f),
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            when (result) {
                is ConnectionTest.Success -> {
                    Text(
                        text = "Connected",
                        style = MaterialTheme.typography.titleMedium,
                        color = KioskGreen,
                    )
                    val device = result.deviceName ?: "Unnamed device"
                    val location = result.location?.takeIf { it.isNotBlank() }
                    Text(
                        text = if (location != null) "Device: $device · $location" else "Device: $device",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (result.faceServiceReady == false) {
                        Text(
                            text = "Face service is still starting on the server — scans may " +
                                "fail until it is ready.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = KioskAmber,
                        )
                    }
                    result.serverTime?.let { serverTime ->
                        Text(
                            text = "Server time: $serverTime",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                is ConnectionTest.Failure -> {
                    Text(
                        text = "Connection failed",
                        style = MaterialTheme.typography.titleMedium,
                        color = KioskRed,
                    )
                    Text(
                        text = result.message,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}
