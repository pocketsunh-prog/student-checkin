package com.schoolcheck.kiosk.ui.enroll

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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.schoolcheck.kiosk.ui.kiosk.FaceGuidance
import com.schoolcheck.kiosk.ui.kiosk.KioskCameraController
import com.schoolcheck.kiosk.ui.kiosk.hint
import com.schoolcheck.kiosk.ui.theme.BackgroundDark
import com.schoolcheck.kiosk.ui.theme.KioskAmber
import com.schoolcheck.kiosk.ui.theme.KioskGreen
import com.schoolcheck.kiosk.ui.theme.KioskRed

/**
 * Native student face registration for phones/tablets:
 * student credentials -> live camera with ML Kit guidance -> POST /api/student/enroll-face.
 * This is the Android alternative to the webcam flow on `/register` (which browsers block
 * on plain-HTTP LAN origins because a camera needs a secure context).
 */
@Composable
fun EnrollmentScreen(onBack: () -> Unit) {
    val viewModel: EnrollmentViewModel = viewModel(factory = EnrollmentViewModel.Factory)
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraController = remember { KioskCameraController(context) }

    var hasPermission by remember { mutableStateOf(context.hasCameraPermission()) }
    var permissionAsked by rememberSaveable { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasPermission = granted
        permissionAsked = true
    }

    LaunchedEffect(ui.step) {
        if (ui.step == EnrollmentStep.CAMERA && !hasPermission && !permissionAsked) {
            permissionAsked = true
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    DisposableEffect(hasPermission, ui.step) {
        if (hasPermission && ui.step == EnrollmentStep.CAMERA) {
            cameraController.start(
                lifecycleOwner = lifecycleOwner,
                useFrontCamera = true,
                onReady = viewModel::onCameraReady,
                onError = viewModel::onCameraError,
                onFaceDetection = viewModel::onFaceDetection,
            )
        }
        onDispose { cameraController.stop() }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        when (ui.step) {
            EnrollmentStep.CREDENTIALS -> CredentialsStep(
                studentId = ui.studentId,
                password = ui.password,
                busy = ui.busy,
                error = ui.error,
                onStudentId = viewModel::updateStudentId,
                onPassword = viewModel::updatePassword,
                onSubmit = viewModel::login,
                onBack = onBack,
            )

            EnrollmentStep.CAMERA -> CameraStep(
                ui = ui,
                hasPermission = hasPermission,
                permissionAsked = permissionAsked,
                preview = cameraController.previewView,
                onRequestPermission = {
                    permissionAsked = true
                    permissionLauncher.launch(Manifest.permission.CAMERA)
                },
                onOpenSettings = { context.openAppSettings() },
                onCapture = {
                    cameraController.capture(
                        onCaptured = viewModel::enroll,
                        onError = viewModel::onCameraError,
                    )
                },
                onBack = {
                    viewModel.reset()
                },
                onCancel = onBack,
            )

            EnrollmentStep.SUCCESS -> SuccessStep(
                studentName = ui.student?.fullName ?: ui.student?.studentId.orEmpty(),
                studentId = ui.student?.studentId.orEmpty(),
                onDone = onBack,
            )
        }

        if (ui.uploading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.65f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = KioskGreen, strokeWidth = 5.dp)
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "Registering face…",
                        style = MaterialTheme.typography.titleLarge,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun CredentialsStep(
    studentId: String,
    password: String,
    busy: Boolean,
    error: String?,
    onStudentId: (String) -> Unit,
    onPassword: (String) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = onBack) { Text("Back") }
        }
        Spacer(Modifier.height(20.dp))
        Text(
            text = "Register your face",
            style = MaterialTheme.typography.displaySmall,
            color = Color.White,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Sign in with your student account, then look at the camera. " +
                "Your face is stored only as a recognition key on the school server.",
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.75f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                OutlinedTextField(
                    value = studentId,
                    onValueChange = onStudentId,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Student ID") },
                    singleLine = true,
                    enabled = !busy,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                    ),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = onPassword,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Password") },
                    singleLine = true,
                    enabled = !busy,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                    ),
                )
                if (error != null) {
                    Text(
                        text = error,
                        color = KioskRed,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Button(
                    onClick = onSubmit,
                    enabled = !busy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(58.dp),
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(10.dp))
                        Text("Signing in…")
                    } else {
                        Text("Continue to camera")
                    }
                }
            }
        }
        Spacer(Modifier.height(18.dp))
        Text(
            text = "Forgot your password? Ask the school office to reset it.",
            style = MaterialTheme.typography.bodySmall,
            color = Color.White.copy(alpha = 0.55f),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CameraStep(
    ui: EnrollmentUiState,
    hasPermission: Boolean,
    permissionAsked: Boolean,
    preview: android.view.View,
    onRequestPermission: () -> Unit,
    onOpenSettings: () -> Unit,
    onCapture: () -> Unit,
    onBack: () -> Unit,
    onCancel: () -> Unit,
) {
    val ready = ui.faceGuidance == FaceGuidance.READY
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onCancel) { Text("Cancel") }
            Spacer(Modifier.weight(1f))
            Text(
                text = "Register face",
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
            )
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("Sign out") }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            if (hasPermission) {
                AndroidView(
                    factory = { preview },
                    modifier = Modifier.fillMaxSize(),
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.12f)),
                )
                Column(
                    modifier = Modifier.padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Canvas(
                        modifier = Modifier
                            .fillMaxWidth(0.62f)
                            .aspectRatio(0.78f),
                    ) {
                        drawOval(
                            color = when {
                                ready -> KioskGreen
                                ui.faceGuidance == FaceGuidance.SEARCHING ||
                                    ui.faceGuidance == FaceGuidance.NO_FACE ||
                                    ui.faceGuidance == FaceGuidance.UNAVAILABLE ->
                                    Color.White.copy(alpha = 0.9f)
                                else -> KioskAmber
                            },
                            style = Stroke(width = if (ready) 7.dp.toPx() else 4.dp.toPx()),
                        )
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = when {
                            ui.cameraError != null -> ui.cameraError.orEmpty()
                            !ui.cameraReady -> "Starting camera…"
                            ready -> "Face ready — hold still"
                            else -> ui.faceGuidance.hint()
                        },
                        style = MaterialTheme.typography.titleLarge,
                        color = when {
                            ui.cameraError != null -> KioskRed
                            ready -> KioskGreen
                            else -> Color.White
                        },
                        textAlign = TextAlign.Center,
                    )
                }
            } else {
                Column(
                    modifier = Modifier.padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Camera access needed",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "Allow the camera to take one registration photo. " +
                            "Photos are sent only to the school server and are not saved on this device.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.75f),
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(18.dp))
                    Button(onClick = onRequestPermission) { Text("Allow camera") }
                    if (permissionAsked) {
                        TextButton(onClick = onOpenSettings) { Text("Open app settings") }
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (!hasPermission) {
                Text(
                    text = "Grant camera permission to continue.",
                    color = KioskAmber,
                    textAlign = TextAlign.Center,
                )
            } else {
                Text(
                    text = ui.student?.let { "${it.fullName} · ${it.studentId}" }
                        ?: "Student",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.7f),
                )
            }
            if (ui.error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = ui.error,
                    color = KioskRed,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = onCapture,
                enabled = hasPermission && ui.cameraReady && ready && !ui.uploading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(62.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = KioskGreen,
                    contentColor = Color(0xFF04231A),
                    disabledContainerColor = Color.White.copy(alpha = 0.16f),
                    disabledContentColor = Color.White.copy(alpha = 0.5f),
                ),
            ) {
                Text(
                    text = if (ready) "Register this face" else "Position your face to continue",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
    }
}

@Composable
private fun SuccessStep(studentName: String, studentId: String, onDone: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(96.dp)
                .background(KioskGreen.copy(alpha = 0.18f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text("✓", style = MaterialTheme.typography.displayLarge, color = KioskGreen)
        }
        Spacer(Modifier.height(22.dp))
        Text(
            text = "Face registered",
            style = MaterialTheme.typography.displaySmall,
            color = Color.White,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "$studentName · $studentId\nThis student can now scan at the kiosk.",
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.75f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(30.dp))
        Button(
            onClick = onDone,
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
        ) { Text("Done") }
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
