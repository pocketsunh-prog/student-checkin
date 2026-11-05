package com.schoolcheck.kiosk.ui.kiosk

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.schoolcheck.kiosk.SchoolCheckApplication
import com.schoolcheck.kiosk.data.ApiException
import com.schoolcheck.kiosk.data.KioskRepository
import com.schoolcheck.kiosk.data.ScanHistoryRepository
import com.schoolcheck.kiosk.data.model.AppSettings
import com.schoolcheck.kiosk.data.model.ScanHistoryEntry
import com.schoolcheck.kiosk.data.model.VerifyPayload
import com.schoolcheck.kiosk.util.toFriendlyMessage
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class ConnectionStatus { CHECKING, ONLINE, OFFLINE, UNAUTHORIZED }

/** What the result overlay renders after a scan. */
sealed interface ScanResultUi {
    data class Success(
        val fullName: String,
        val studentId: String,
        val className: String?,
        val form: String?,
        val action: String,
        val status: String?,
        val lateMinutes: Int?,
        val confidence: Double?,
        val message: String?,
    ) : ScanResultUi

    data class Unmatched(
        val title: String,
        val detail: String,
        val reason: String?,
    ) : ScanResultUi

    data class Failure(
        val message: String,
        val canRetry: Boolean,
    ) : ScanResultUi
}

data class KioskUiState(
    val settings: AppSettings = AppSettings(),
    val connection: ConnectionStatus = ConnectionStatus.CHECKING,
    val uploading: Boolean = false,
    val result: ScanResultUi? = null,
    val history: List<ScanHistoryEntry> = emptyList(),
    val cameraReady: Boolean = false,
    val cameraError: String? = null,
    val faceGuidance: FaceGuidance = FaceGuidance.SEARCHING,
    val useFrontCamera: Boolean = true,
    val serverTime: String? = null,
    val lastHeartbeatMillis: Long? = null,
)

/**
 * Owns the kiosk screen state: heartbeat, camera readiness, single in-flight scan upload,
 * result overlay lifetime and the local scan history.
 */
class KioskViewModel(
    private val repository: KioskRepository,
    private val historyRepository: ScanHistoryRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(KioskUiState())
    val ui: StateFlow<KioskUiState> = _ui.asStateFlow()

    private var heartbeatJob: Job? = null
    private var dismissJob: Job? = null

    /** Kept in memory only, for a manual retry after a network failure. Never persisted. */
    private var lastAttempt: ByteArray? = null

    init {
        viewModelScope.launch {
            repository.settings.collect { settings ->
                _ui.update { it.copy(settings = settings) }
            }
        }
        viewModelScope.launch {
            historyRepository.entries.collect { entries ->
                _ui.update { it.copy(history = entries) }
            }
        }
    }

    // ---------------------------------------------------------------- camera

    fun onCameraReady() =
        _ui.update { it.copy(cameraReady = true, cameraError = null, faceGuidance = FaceGuidance.SEARCHING) }

    fun onCameraError(message: String) =
        _ui.update { it.copy(cameraReady = false, cameraError = message) }

    fun onFaceDetection(detection: FaceDetection) =
        _ui.update { it.copy(faceGuidance = detection.guidance) }

    fun toggleCamera() = _ui.update { it.copy(useFrontCamera = !it.useFrontCamera) }

    fun onCaptureError(message: String) = _ui.update { it.copy(uploading = false, cameraError = message) }

    // ------------------------------------------------------------- heartbeat

    fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = viewModelScope.launch {
            while (isActive) {
                runHeartbeat()
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private suspend fun runHeartbeat() {
        try {
            val payload = repository.heartbeat(repository.currentSettings())
            Log.d(TAG, "heartbeat ok")
            _ui.update {
                it.copy(
                    connection = ConnectionStatus.ONLINE,
                    serverTime = payload.serverTime,
                    lastHeartbeatMillis = System.currentTimeMillis(),
                )
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            val status = if (error is ApiException && error.httpStatus == 401) {
                ConnectionStatus.UNAUTHORIZED
            } else {
                ConnectionStatus.OFFLINE
            }
            Log.w(TAG, "heartbeat failed: $status ${error.javaClass.simpleName}: ${error.message}")
            _ui.update {
                it.copy(connection = status, lastHeartbeatMillis = System.currentTimeMillis())
            }
        }
    }

    // ----------------------------------------------------------------- scans

    fun uploadCapture(jpeg: ByteArray) {
        if (_ui.value.uploading) return
        lastAttempt = jpeg
        performUpload(jpeg)
    }

    fun retryLastUpload() {
        if (_ui.value.uploading) return
        val bytes = lastAttempt ?: return
        performUpload(bytes)
    }

    private fun performUpload(jpeg: ByteArray) {
        if (_ui.value.uploading) return
        _ui.update { it.copy(uploading = true, result = null) }
        viewModelScope.launch {
            try {
                val payload = repository.verify(repository.currentSettings(), jpeg)
                _ui.update {
                    it.copy(
                        uploading = false,
                        connection = ConnectionStatus.ONLINE,
                        lastHeartbeatMillis = System.currentTimeMillis(),
                    )
                }
                if (payload.matched) {
                    val result = payload.toSuccessUi()
                    historyRepository.add(result.toHistoryEntry())
                    lastAttempt = null
                    showResult(result)
                } else {
                    lastAttempt = null
                    showResult(unmatchedResult(payload))
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "verify failed: ${error.javaClass.simpleName}: ${error.message}")
                _ui.update {
                    it.copy(
                        uploading = false,
                        connection = if (error is IOException) {
                            ConnectionStatus.OFFLINE
                        } else {
                            it.connection
                        },
                    )
                }
                showResult(
                    ScanResultUi.Failure(
                        message = error.toFriendlyMessage(),
                        canRetry = lastAttempt != null,
                    ),
                )
            }
        }
    }

    fun dismissResult() {
        dismissJob?.cancel()
        lastAttempt = null
        _ui.update { it.copy(result = null) }
    }

    private fun showResult(result: ScanResultUi) {
        dismissJob?.cancel()
        _ui.update { it.copy(result = result) }
        if (result is ScanResultUi.Success || result is ScanResultUi.Unmatched) {
            dismissJob = viewModelScope.launch {
                delay(RESULT_VISIBLE_MS)
                _ui.update { it.copy(result = null) }
            }
        }
        // Failures stay on screen until the operator retries or dismisses.
    }

    private fun unmatchedResult(payload: VerifyPayload): ScanResultUi.Unmatched {
        val title = when (payload.reason) {
            "NO_FACE" -> "No face detected"
            "MULTIPLE_FACES" -> "More than one face"
            "NO_MATCH" -> "Face not recognised"
            else -> "Scan not matched"
        }
        // Prefer the server's message, unless it just repeats the title.
        val detail = payload.message
            ?.takeIf { it.isNotBlank() && !it.equals(title, ignoreCase = true) }
            ?: when (payload.reason) {
                "NO_FACE" -> "Centre one face inside the oval and try again."
                "MULTIPLE_FACES" -> "Only one person should be in front of the camera."
                "NO_MATCH" -> "This face is not enrolled yet. Ask the school office to register it."
                else -> "Try again with better lighting."
            }
        return ScanResultUi.Unmatched(title = title, detail = detail, reason = payload.reason)
    }

    private fun VerifyPayload.toSuccessUi(): ScanResultUi.Success = ScanResultUi.Success(
        fullName = student?.fullName?.takeIf { it.isNotBlank() } ?: "Student",
        studentId = student?.studentId.orEmpty(),
        className = student?.className,
        form = student?.form,
        action = action ?: "CHECK_IN",
        status = attendance?.status,
        lateMinutes = attendance?.lateMinutes,
        confidence = confidence,
        message = message,
    )

    private fun ScanResultUi.Success.toHistoryEntry(): ScanHistoryEntry = ScanHistoryEntry(
        atMillis = System.currentTimeMillis(),
        studentId = studentId,
        fullName = fullName,
        className = className,
        action = action,
        status = status,
        lateMinutes = lateMinutes,
        confidence = confidence,
    )

    companion object {
        private const val TAG = "SchoolCheckKiosk"
        private const val HEARTBEAT_INTERVAL_MS = 60_000L
        private const val RESULT_VISIBLE_MS = 5_000L

        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]
                    as SchoolCheckApplication
                KioskViewModel(app.kioskRepository, app.scanHistoryRepository)
            }
        }
    }
}
