package com.schoolcheck.kiosk.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.schoolcheck.kiosk.SchoolCheckApplication
import com.schoolcheck.kiosk.data.KioskRepository
import com.schoolcheck.kiosk.data.model.AppSettings
import com.schoolcheck.kiosk.util.UrlUtils
import com.schoolcheck.kiosk.util.toFriendlyMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ConnectionTest {
    data class Success(
        val deviceName: String?,
        val location: String?,
        val faceServiceReady: Boolean?,
        val serverTime: String?,
    ) : ConnectionTest

    data class Failure(val message: String) : ConnectionTest
}

data class SetupUiState(
    val testing: Boolean = false,
    val saving: Boolean = false,
    val testResult: ConnectionTest? = null,
    val urlError: String? = null,
    val keyError: String? = null,
    val saved: Boolean = false,
)

class SetupViewModel(private val repository: KioskRepository) : ViewModel() {

    private val _ui = MutableStateFlow(SetupUiState())
    val ui: StateFlow<SetupUiState> = _ui.asStateFlow()

    fun testConnection(rawUrl: String, rawDeviceKey: String) {
        val urlError = UrlUtils.validateBaseUrl(rawUrl)
        val keyError = UrlUtils.validateDeviceKey(rawDeviceKey)
        if (urlError != null || keyError != null) {
            _ui.update { it.copy(urlError = urlError, keyError = keyError, testResult = null) }
            return
        }
        val settings = AppSettings(
            baseUrl = UrlUtils.normalizeBaseUrl(rawUrl),
            deviceKey = rawDeviceKey.trim(),
        )
        _ui.update {
            it.copy(testing = true, testResult = null, urlError = null, keyError = null)
        }
        viewModelScope.launch {
            val result = try {
                val health = repository.health(settings)
                ConnectionTest.Success(
                    deviceName = health.device?.name,
                    location = health.device?.location,
                    faceServiceReady = health.faceServiceReady,
                    serverTime = health.serverTime,
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                ConnectionTest.Failure(error.toFriendlyMessage())
            }
            _ui.update { it.copy(testing = false, testResult = result) }
        }
    }

    fun save(rawUrl: String, rawDeviceKey: String) {
        val urlError = UrlUtils.validateBaseUrl(rawUrl)
        val keyError = UrlUtils.validateDeviceKey(rawDeviceKey)
        if (urlError != null || keyError != null) {
            _ui.update { it.copy(urlError = urlError, keyError = keyError) }
            return
        }
        val settings = AppSettings(
            baseUrl = UrlUtils.normalizeBaseUrl(rawUrl),
            deviceKey = rawDeviceKey.trim(),
            configured = true,
        )
        _ui.update { it.copy(saving = true, urlError = null, keyError = null) }
        viewModelScope.launch {
            repository.saveSettings(settings)
            _ui.update { it.copy(saving = false, saved = true) }
        }
    }

    fun consumeSaved() = _ui.update { it.copy(saved = false) }

    fun clearErrors() = _ui.update { it.copy(urlError = null, keyError = null) }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]
                    as SchoolCheckApplication
                SetupViewModel(app.kioskRepository)
            }
        }
    }
}
