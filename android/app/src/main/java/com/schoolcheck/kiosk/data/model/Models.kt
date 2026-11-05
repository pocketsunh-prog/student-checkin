package com.schoolcheck.kiosk.data.model

import com.schoolcheck.kiosk.BuildConfig
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Default school server URL, baked at build time.
 *
 * Override per deployment with:
 *   .\gradlew.bat assembleRelease -PschoolcheckServerUrl=http://10.0.0.20:3000/api
 *
 * Port 3000 is the Next.js web service, which proxies API paths to the backend on 3001
 * (see admin/src/app/api/[...path]/route.ts). This lets a school expose one HTTP port.
 */
const val DEFAULT_BASE_URL = BuildConfig.DEFAULT_SERVER_URL

/** Development seed key from docs/API.md §8. Rotate per kiosk in the admin portal. */
const val DEFAULT_DEVICE_KEY = "demo-kiosk-key-12345"

data class AppSettings(
    val baseUrl: String = DEFAULT_BASE_URL,
    val deviceKey: String = DEFAULT_DEVICE_KEY,
    /** True once the setup screen has been completed at least once. */
    val configured: Boolean = false,
)

@Serializable
data class DeviceInfo(
    val id: String? = null,
    val name: String? = null,
    val location: String? = null,
)

/** docs/API.md §5 GET /api/kiosk/health payload. */
@Serializable
data class HealthPayload(
    val device: DeviceInfo? = null,
    val serverTime: String? = null,
    val faceServiceReady: Boolean? = null,
)

/** docs/API.md §5 POST /api/kiosk/heartbeat payload. */
@Serializable
data class HeartbeatPayload(
    val ok: Boolean? = null,
    val serverTime: String? = null,
)

@Serializable
data class StudentInfo(
    val studentId: String = "",
    val fullName: String = "",
    @SerialName("class") val className: String? = null,
    val form: String? = null,
    val photoUrl: String? = null,
)

@Serializable
data class AttendanceInfo(
    val id: String? = null,
    val date: String? = null,
    val checkInAt: String? = null,
    val checkOutAt: String? = null,
    val status: String? = null,
    val lateMinutes: Int? = null,
)

/**
 * `data` payload of docs/API.md §5 POST /api/kiosk/verify. A completed scan is always
 * HTTP 200; [matched] is false for NO_FACE / MULTIPLE_FACES / NO_MATCH.
 */
@Serializable
data class VerifyPayload(
    val matched: Boolean = false,
    val action: String? = null,
    val confidence: Double? = null,
    val student: StudentInfo? = null,
    val attendance: AttendanceInfo? = null,
    val message: String? = null,
    val reason: String? = null,
)

/** One row of the on-device "recent scans" list (last 10, kept locally only). */
@Serializable
data class ScanHistoryEntry(
    val atMillis: Long,
    val studentId: String,
    val fullName: String,
    val className: String? = null,
    val action: String = "",
    val status: String? = null,
    val lateMinutes: Int? = null,
    val confidence: Double? = null,
)
