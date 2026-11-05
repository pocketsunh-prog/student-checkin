package com.schoolcheck.kiosk.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.schoolcheck.kiosk.data.model.ScanHistoryEntry
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.scanHistoryStore: DataStore<Preferences> by preferencesDataStore(name = "scan_history")

/**
 * Last [MAX_ENTRIES] successful scans, stored locally so a kiosk restart does not lose
 * the "recent scans" panel. No images are ever stored here — only the result metadata.
 */
class ScanHistoryRepository(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    val entries: Flow<List<ScanHistoryEntry>> = context.scanHistoryStore.data
        .catch { error ->
            if (error is IOException) emit(emptyPreferences()) else throw error
        }
        .map { prefs -> decode(prefs[KEY]) }

    suspend fun add(entry: ScanHistoryEntry) {
        context.scanHistoryStore.edit { prefs ->
            val updated = (listOf(entry) + decode(prefs[KEY])).take(MAX_ENTRIES)
            prefs[KEY] = json.encodeToString(updated)
        }
    }

    private fun decode(raw: String?): List<ScanHistoryEntry> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching { json.decodeFromString<List<ScanHistoryEntry>>(raw) }
            .getOrDefault(emptyList())
    }

    private companion object {
        const val MAX_ENTRIES = 10
        val KEY = stringPreferencesKey("entries")
    }
}
