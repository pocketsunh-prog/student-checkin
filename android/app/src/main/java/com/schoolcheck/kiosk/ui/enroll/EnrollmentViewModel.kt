package com.schoolcheck.kiosk.ui.enroll

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.schoolcheck.kiosk.SchoolCheckApplication
import com.schoolcheck.kiosk.data.ApiException
import com.schoolcheck.kiosk.data.KioskRepository
import com.schoolcheck.kiosk.data.model.StudentAccount
import com.schoolcheck.kiosk.ui.kiosk.FaceDetection
import com.schoolcheck.kiosk.ui.kiosk.FaceGuidance
import com.schoolcheck.kiosk.util.toFriendlyMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class EnrollmentStep { CREDENTIALS, CAMERA, SUCCESS }

data class EnrollmentUiState(
    val studentId: String = "",
    val password: String = "",
    val step: EnrollmentStep = EnrollmentStep.CREDENTIALS,
    val busy: Boolean = false,
    val uploading: Boolean = false,
    val error: String? = null,
    val student: StudentAccount? = null,
    val faceGuidance: FaceGuidance = FaceGuidance.SEARCHING,
    val cameraReady: Boolean = false,
    val cameraError: String? = null,
    val enrolledAt: String? = null,
)

/**
 * Student-assisted face registration from the kiosk/tablet:
 * 1. student signs in with their studentId + password,
 * 2. the camera shows live face guidance until a single well-framed face is ready,
 * 3. the captured JPEG is uploaded to POST /api/student/enroll-face with the student JWT.
 *
 * The token is kept in memory only; it is never persisted on the shared device.
 */
class EnrollmentViewModel(private val repository: KioskRepository) : ViewModel() {

    private val _ui = MutableStateFlow(EnrollmentUiState())
    val ui: StateFlow<EnrollmentUiState> = _ui.asStateFlow()

    private var token: String? = null

    fun updateStudentId(value: String) = _ui.update {
        it.copy(studentId = value, error = null)
    }

    fun updatePassword(value: String) = _ui.update {
        it.copy(password = value, error = null)
    }

    fun login() {
        val state = _ui.value
        if (state.busy) return
        val studentId = state.studentId.trim()
        if (studentId.isBlank() || state.password.isBlank()) {
            _ui.update { it.copy(error = "Enter your student ID and password.") }
            return
        }
        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                val settings = repository.currentSettings()
                val payload = repository.studentLogin(settings, studentId, state.password)
                val student = payload.student
                if (payload.token.isBlank() || student == null) {
                    throw ApiException(
                        code = "INVALID_RESPONSE",
                        message = "The server did not return a student session.",
                        httpStatus = 0,
                    )
                }
                token = payload.token
                _ui.update {
                    it.copy(
                        busy = false,
                        step = EnrollmentStep.CAMERA,
                        student = student,
                        password = "",
                        error = null,
                        faceGuidance = FaceGuidance.SEARCHING,
                        cameraReady = false,
                        cameraError = null,
                    )
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "student login failed: ${error.javaClass.simpleName}: ${error.message}")
                _ui.update { it.copy(busy = false, error = friendlyLoginError(error)) }
            }
        }
    }

    fun onCameraReady() = _ui.update {
        it.copy(cameraReady = true, cameraError = null, faceGuidance = FaceGuidance.SEARCHING)
    }

    fun onCameraError(message: String) = _ui.update {
        it.copy(cameraReady = false, cameraError = message)
    }

    fun onFaceDetection(detection: FaceDetection) = _ui.update {
        it.copy(faceGuidance = detection.guidance)
    }

    fun enroll(jpeg: ByteArray) {
        val state = _ui.value
        val sessionToken = token ?: return
        if (state.uploading) return
        if (state.faceGuidance != FaceGuidance.READY) {
            _ui.update { it.copy(error = "Wait for the face-ready notice before registering.") }
            return
        }
        _ui.update { it.copy(uploading = true, error = null) }
        viewModelScope.launch {
            try {
                val settings = repository.currentSettings()
                val payload = repository.enrollFace(settings, sessionToken, jpeg)
                if (!payload.faceEnrolled) {
                    throw ApiException(
                        code = "ENROLL_FAILED",
                        message = "The server did not enrol this face. Try again.",
                        httpStatus = 0,
                    )
                }
                _ui.update {
                    it.copy(
                        uploading = false,
                        step = EnrollmentStep.SUCCESS,
                        enrolledAt = payload.enrolledAt,
                    )
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "face enrol failed: ${error.javaClass.simpleName}: ${error.message}")
                _ui.update { it.copy(uploading = false, error = friendlyEnrollError(error)) }
            }
        }
    }

    fun reset() {
        token = null
        _ui.value = EnrollmentUiState()
    }

    private fun friendlyLoginError(error: Throwable): String = when {
        error is ApiException && error.httpStatus == 401 ->
            "Student ID or password is incorrect."
        error is ApiException && error.httpStatus == 403 ->
            "This student account cannot register a face."
        else -> error.toFriendlyMessage()
    }

    private fun friendlyEnrollError(error: Throwable): String = when {
        error is ApiException && error.code == "FACE_ALREADY_ENROLLED" ->
            "This face is already registered to another student. Ask the school office for help."
        error is ApiException && error.httpStatus == 401 ->
            "Your sign-in expired. Go back and sign in again."
        else -> error.toFriendlyMessage()
    }

    companion object {
        private const val TAG = "SchoolCheckEnroll"

        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]
                    as SchoolCheckApplication
                EnrollmentViewModel(app.kioskRepository)
            }
        }
    }
}
