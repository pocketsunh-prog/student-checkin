package com.schoolcheck.kiosk.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.schoolcheck.kiosk.data.model.AppSettings
import com.schoolcheck.kiosk.data.model.DEFAULT_BASE_URL
import com.schoolcheck.kiosk.data.model.DEFAULT_DEVICE_KEY
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

private val Context.kioskSettingsStore: DataStore<Preferences> by preferencesDataStore(name = "kiosk_settings")

/** Persists the server URL + device key with DataStore Preferences. */
class SettingsRepository(private val context: Context) {

    private val store = context.kioskSettingsStore

    val settings: Flow<AppSettings> = store.data
        .catch { error ->
            if (error is IOException) emit(emptyPreferences()) else throw error
        }
        .map { prefs ->
            AppSettings(
                baseUrl = prefs[Keys.BASE_URL] ?: DEFAULT_BASE_URL,
                deviceKey = prefs[Keys.DEVICE_KEY] ?: DEFAULT_DEVICE_KEY,
                configured = prefs[Keys.CONFIGURED] ?: false,
            )
        }

    suspend fun save(settings: AppSettings) {
        store.edit { prefs ->
            prefs[Keys.BASE_URL] = settings.baseUrl
            prefs[Keys.DEVICE_KEY] = settings.deviceKey
            prefs[Keys.CONFIGURED] = settings.configured
        }
    }

    private object Keys {
        val BASE_URL = stringPreferencesKey("base_url")
        val DEVICE_KEY = stringPreferencesKey("device_key")
        val CONFIGURED = booleanPreferencesKey("configured")
    }
}
