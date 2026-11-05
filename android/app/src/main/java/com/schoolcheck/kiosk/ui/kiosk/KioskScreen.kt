package com.schoolcheck.kiosk.ui.kiosk

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.schoolcheck.kiosk.ui.theme.BackgroundDark
import com.schoolcheck.kiosk.ui.theme.KioskAmber
import com.schoolcheck.kiosk.ui.theme.KioskGreen
import com.schoolcheck.kiosk.ui.theme.KioskRed

/**
 * The kiosk itself: full-bleed front camera preview, face oval guide, one huge Scan
 * button, connection badge, settings entry and the recent-scans panel.
 */
@Composable
fun KioskScreen(
    onOpenSetup: () -> Unit,
    onOpenEnrollment: () -> Unit,
) {
    val viewModel: KioskViewModel = viewModel(factory = KioskViewModel.Factory)
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Heartbeat runs only while the kiosk screen is visible (60 s cadence in the VM).
    DisposableEffect(Unit) {
        viewModel.startHeartbeat()
        onDispose { viewModel.stopHeartbeat() }
    }

    var hasPermission by remember { mutableStateOf(context.hasCameraPermission()) }
    var showRationale by rememberSaveable { mutableStateOf(false) }
    var askedOnce by rememberSaveable { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasPermission = granted
        askedOnce = true
    }

    // Show an in-app explanation before the very first system permission prompt.
    LaunchedEffect(Unit) {
        if (!hasPermission && !askedOnce) showRationale = true
    }

    // Picking the permission up again after returning from the system app settings.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasPermission = context.hasCameraPermission()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val cameraController = remember { KioskCameraController(context) }
    LaunchedEffect(hasPermission, ui.useFrontCamera) {
        if (!hasPermission) return@LaunchedEffect
        cameraController.start(
            lifecycleOwner = lifecycleOwner,
            useFrontCamera = ui.useFrontCamera,
            onReady = viewModel::onCameraReady,
            onError = viewModel::onCameraError,
            onFaceDetection = viewModel::onFaceDetection,
        )
    }
    DisposableEffect(Unit) {
        onDispose { cameraController.stop() }
    }

    var showRecent by rememberSaveable { mutableStateOf(false) }
    var showSettingsConfirm by rememberSaveable { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark),
    ) {
        if (hasPermission) {
            AndroidView(
                factory = { cameraController.previewView },
                modifier = Modifier.fillMaxSize(),
            )
            // Vignette so the white controls stay readable over bright frames.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Black.copy(alpha = 0.6f),
                            0.32f to Color.Transparent,
                            0.66f to Color.Transparent,
                            1f to Color.Black.copy(alpha = 0.75f),
                        ),
                    ),
            )
        } else {
            CameraPermissionPanel(
                showSettingsButton = askedOnce,
                onRequest = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                onOpenSettings = { context.openAppSettings() },
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing),
        ) {
            KioskTopBar(
                connection = ui.connection,
                recentCount = ui.history.size,
                onOpenRecent = { showRecent = true },
                onOpenSettings = { showSettingsConfirm = true },
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                if (hasPermission) {
                    FaceGuide(
                        cameraReady = ui.cameraReady,
                        cameraError = ui.cameraError,
                        faceGuidance = ui.faceGuidance,
                    )
                }
            }

            KioskBottomBar(
                enabled = hasPermission &&
                    ui.cameraReady &&
                    !ui.uploading &&
                    (ui.faceGuidance == FaceGuidance.READY ||
                        ui.faceGuidance == FaceGuidance.UNAVAILABLE),
                uploading = ui.uploading,
                faceGuidance = ui.faceGuidance,
                useFrontCamera = ui.useFrontCamera,
                onFlipCamera = viewModel::toggleCamera,
                onCapture = {
                    cameraController.capture(
                        onCaptured = viewModel::uploadCapture,
                        onError = viewModel::onCaptureError,
                    )
                },
            )
        }

        if (ui.uploading) {
            UploadingOverlay()
        }

        ui.result?.let { result ->
            ScanResultOverlay(
                result = result,
                onDismiss = viewModel::dismissResult,
                onRetry = viewModel::retryLastUpload,
                onRegisterFace = {
                    viewModel.dismissResult()
                    onOpenEnrollment()
                },
            )
        }

        if (showRecent) {
            RecentScansPanel(entries = ui.history, onDismiss = { showRecent = false })
        }

        if (showSettingsConfirm) {
            AlertDialog(
                onDismissRequest = { showSettingsConfirm = false },
                title = { Text("Kiosk settings") },
                text = {
                    Text(
                        "Open setup to change the server URL or device key? The camera pauses " +
                            "while settings are open.",
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showSettingsConfirm = false
                            onOpenSetup()
                        },
                    ) { Text("Open settings") }
                },
                dismissButton = {
                    TextButton(onClick = { showSettingsConfirm = false }) { Text("Cancel") }
                },
            )
        }

        if (showRationale) {
            AlertDialog(
                onDismissRequest = {
                    showRationale = false
                    askedOnce = true
                },
                title = { Text("Camera permission") },
                text = {
                    Text(
                        "SchoolCheck Kiosk uses the camera to scan a student's face for " +
                            "check-in and check-out. Photos are sent to the school server and " +
                            "are never saved on this device.",
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showRationale = false
                            permissionLauncher.launch(Manifest.permission.CAMERA)
                        },
                    ) { Text("Allow camera") }
                },
                dismissButton = {
                    TextButton(
                        onClick = {
                            showRationale = false
                            askedOnce = true
                        },
                    ) { Text("Not now") }
                },
            )
        }
    }
}

@Composable
private fun KioskTopBar(
    connection: ConnectionStatus,
    recentCount: Int,
    onOpenRecent: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ConnectionBadge(connection)
        Spacer(Modifier.weight(1f))
        TextButton(onClick = onOpenRecent) {
            Text(
                text = if (recentCount > 0) "Recent ($recentCount)" else "Recent",
                color = Color.White,
            )
        }
        Spacer(Modifier.width(6.dp))
        IconButton(
            onClick = onOpenSettings,
            modifier = Modifier.size(56.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Settings,
                contentDescription = "Kiosk settings",
                tint = Color.White,
                modifier = Modifier.size(30.dp),
            )
        }
    }
}

@Composable
private fun ConnectionBadge(connection: ConnectionStatus) {
    val label: String
    val color: Color
    when (connection) {
        ConnectionStatus.ONLINE -> {
            label = "Online"
            color = KioskGreen
        }

        ConnectionStatus.OFFLINE -> {
            label = "Offline"
            color = KioskRed
        }

        ConnectionStatus.UNAUTHORIZED -> {
            label = "Key rejected"
            color = KioskRed
        }

        ConnectionStatus.CHECKING -> {
            label = "Connecting…"
            color = KioskAmber
        }
    }
    Row(
        modifier = Modifier
            .background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(50))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(color, CircleShape),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White,
        )
    }
}

@Composable
private fun FaceGuide(
    cameraReady: Boolean,
    cameraError: String?,
    faceGuidance: FaceGuidance,
) {
    val ready = faceGuidance == FaceGuidance.READY
    val ovalColor = when {
        ready -> KioskGreen
        faceGuidance == FaceGuidance.SEARCHING ||
            faceGuidance == FaceGuidance.NO_FACE ||
            faceGuidance == FaceGuidance.UNAVAILABLE -> Color.White.copy(alpha = 0.9f)
        else -> KioskAmber
    }

    Column(
        modifier = Modifier.padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth(0.66f)
                .aspectRatio(0.78f),
        ) {
            drawOval(
                color = ovalColor,
                style = Stroke(width = if (ready) 7.dp.toPx() else 4.dp.toPx()),
            )
        }
        Spacer(Modifier.height(18.dp))
        Text(
            text = when {
                ready -> "Face ready"
                faceGuidance == FaceGuidance.MULTIPLE_FACES -> "One face only"
                faceGuidance == FaceGuidance.TOO_FAR -> "Move closer"
                faceGuidance == FaceGuidance.TOO_CLOSE -> "Move back"
                faceGuidance == FaceGuidance.OFF_CENTER -> "Centre your face"
                else -> "Align your face inside the oval"
            },
            style = MaterialTheme.typography.titleLarge,
            color = if (ready) KioskGreen else Color.White,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(4.dp))
        when {
            cameraError != null -> Text(
                text = cameraError,
                style = MaterialTheme.typography.bodyMedium,
                color = KioskRed,
                textAlign = TextAlign.Center,
            )

            !cameraReady -> Text(
                text = "Starting camera…",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
            )

            else -> Text(
                text = faceGuidance.hint(),
                style = MaterialTheme.typography.bodyMedium,
                color = if (ready) KioskGreen else Color.White.copy(alpha = 0.8f),
                textAlign = TextAlign.Center,
            )
        }
        if (ready) {
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier
                    .background(KioskGreen.copy(alpha = 0.18f), RoundedCornerShape(50))
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(KioskGreen, CircleShape),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Ready — tap Scan",
                    style = MaterialTheme.typography.labelLarge,
                    color = KioskGreen,
                )
            }
        }
    }
}

@Composable
private fun KioskBottomBar(
    enabled: Boolean,
    uploading: Boolean,
    faceGuidance: FaceGuidance,
    useFrontCamera: Boolean,
    onFlipCamera: () -> Unit,
    onCapture: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(148.dp)
                    .border(
                        width = 4.dp,
                        color = Color.White.copy(alpha = if (enabled) 0.9f else 0.3f),
                        shape = CircleShape,
                    ),
            )
            Button(
                onClick = onCapture,
                enabled = enabled,
                modifier = Modifier.size(124.dp),
                shape = CircleShape,
                contentPadding = PaddingValues(0.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = KioskGreen,
                    contentColor = Color(0xFF04231A),
                    disabledContainerColor = Color.White.copy(alpha = 0.18f),
                    disabledContentColor = Color.White.copy(alpha = 0.55f),
                ),
            ) {
                Text(text = "SCAN", fontSize = 24.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        TextButton(onClick = onFlipCamera) {
            Text(
                text = if (useFrontCamera) "Switch to rear camera" else "Switch to front camera",
                color = Color.White.copy(alpha = 0.75f),
            )
        }
        Text(
            text = when {
                uploading -> "Checking face…"
                enabled -> "Tap Scan to check in / out"
                faceGuidance == FaceGuidance.UNAVAILABLE -> "Tap Scan when your face is inside the oval"
                else -> faceGuidance.hint()
            },
            style = MaterialTheme.typography.bodyLarge,
            color = if (enabled) Color.White.copy(alpha = 0.9f) else Color.White.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun UploadingOverlay() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.6f))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { /* swallow taps so the Scan button cannot fire twice */ },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(
                modifier = Modifier.size(64.dp),
                color = KioskGreen,
                strokeWidth = 5.dp,
            )
            Spacer(Modifier.height(20.dp))
            Text(
                text = "Checking face…",
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun CameraPermissionPanel(
    showSettingsButton: Boolean,
    onRequest: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Camera access needed",
            style = MaterialTheme.typography.headlineLarge,
            color = Color.White,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = "This kiosk needs the camera to scan faces for check-in and check-out. " +
                "Photos go straight to the school server and are never saved on this device.",
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))
        Button(
            onClick = onRequest,
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp),
        ) { Text("Allow camera") }
        if (showSettingsButton) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onOpenSettings,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
            ) { Text("Open app settings") }
        }
    }
}

private fun Context.hasCameraPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

private fun Context.openAppSettings() {
    startActivity(
        Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", packageName, null),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}
