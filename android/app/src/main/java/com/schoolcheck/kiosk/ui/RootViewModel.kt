package com.schoolcheck.kiosk.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.schoolcheck.kiosk.SchoolCheckApplication
import com.schoolcheck.kiosk.data.KioskRepository
import com.schoolcheck.kiosk.data.model.AppSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RootUiState(
    val loaded: Boolean = false,
    val settings: AppSettings = AppSettings(),
    val showSetup: Boolean = false,
)

/**
 * Decides between the setup screen (first run / reopened from the kiosk) and the
 * camera kiosk itself.
 */
class RootViewModel(private val repository: KioskRepository) : ViewModel() {

    private val _state = MutableStateFlow(RootUiState())
    val state: StateFlow<RootUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.settings.collect { settings ->
                _state.update { current ->
                    current.copy(
                        loaded = true,
                        settings = settings,
                        // First launch always starts on setup until it is completed once.
                        showSetup = if (!settings.configured) true else current.showSetup,
                    )
                }
            }
        }
    }

    fun openSetup() = _state.update { it.copy(showSetup = true) }

    fun closeSetup() = _state.update { it.copy(showSetup = false) }

    fun onSettingsSaved() = _state.update { it.copy(showSetup = false) }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]
                    as SchoolCheckApplication
                RootViewModel(app.kioskRepository)
            }
        }
    }
}
