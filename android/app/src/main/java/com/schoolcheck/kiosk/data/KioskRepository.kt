package com.schoolcheck.kiosk.data

import com.schoolcheck.kiosk.data.model.AppSettings
import com.schoolcheck.kiosk.data.model.EnrollFacePayload
import com.schoolcheck.kiosk.data.model.HealthPayload
import com.schoolcheck.kiosk.data.model.HeartbeatPayload
import com.schoolcheck.kiosk.data.model.StudentLoginPayload
import com.schoolcheck.kiosk.data.model.VerifyPayload
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

/** Single facade the ViewModels use for settings plus the kiosk device API. */
class KioskRepository(
    private val api: KioskApi,
    private val settingsRepository: SettingsRepository,
) {

    val settings: Flow<AppSettings> = settingsRepository.settings

    /**
     * Reads the persisted settings right now. Used by network calls so the first
     * heartbeat/scan after setup can never race the settings Flow's first emission.
     */
    suspend fun currentSettings(): AppSettings = settingsRepository.settings.first()

    suspend fun saveSettings(settings: AppSettings) = settingsRepository.save(settings)

    suspend fun health(settings: AppSettings): HealthPayload =
        api.health(settings.baseUrl, settings.deviceKey)

    suspend fun heartbeat(settings: AppSettings): HeartbeatPayload =
        api.heartbeat(settings.baseUrl, settings.deviceKey)

    suspend fun verify(settings: AppSettings, jpeg: ByteArray): VerifyPayload =
        api.verify(settings.baseUrl, settings.deviceKey, jpeg)

    suspend fun studentLogin(
        settings: AppSettings,
        studentId: String,
        password: String,
    ): StudentLoginPayload = api.studentLogin(settings.baseUrl, studentId, password)

    suspend fun enrollFace(
        settings: AppSettings,
        token: String,
        jpeg: ByteArray,
    ): EnrollFacePayload = api.enrollFace(settings.baseUrl, token, jpeg)
}
