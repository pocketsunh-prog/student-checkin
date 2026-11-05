package com.schoolcheck.kiosk

import android.app.Application
import com.schoolcheck.kiosk.data.HttpClientProvider
import com.schoolcheck.kiosk.data.KioskApi
import com.schoolcheck.kiosk.data.KioskRepository
import com.schoolcheck.kiosk.data.ScanHistoryRepository
import com.schoolcheck.kiosk.data.SettingsRepository

/**
 * Tiny manual dependency graph. The app is a single-screen kiosk, so a DI framework
 * would only add build weight.
 */
class SchoolCheckApplication : Application() {

    val settingsRepository: SettingsRepository by lazy { SettingsRepository(this) }

    val scanHistoryRepository: ScanHistoryRepository by lazy { ScanHistoryRepository(this) }

    val kioskApi: KioskApi by lazy { KioskApi(HttpClientProvider.client) }

    val kioskRepository: KioskRepository by lazy {
        KioskRepository(kioskApi, settingsRepository)
    }
}
