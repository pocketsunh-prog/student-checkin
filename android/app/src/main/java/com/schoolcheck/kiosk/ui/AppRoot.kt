package com.schoolcheck.kiosk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.schoolcheck.kiosk.ui.enroll.EnrollmentScreen
import com.schoolcheck.kiosk.ui.kiosk.KioskScreen
import com.schoolcheck.kiosk.ui.setup.SetupScreen

/** Setup (first run / settings) or the camera kiosk. */
@Composable
fun AppRoot() {
    val rootViewModel: RootViewModel = viewModel(factory = RootViewModel.Factory)
    val state by rootViewModel.state.collectAsStateWithLifecycle()

    when {
        !state.loaded -> BootScreen()

        state.showEnrollment -> EnrollmentScreen(onBack = rootViewModel::closeEnrollment)

        state.showSetup -> SetupScreen(
            initial = state.settings,
            isFirstRun = !state.settings.configured,
            onSaved = rootViewModel::onSettingsSaved,
            onCancel = if (state.settings.configured) rootViewModel::closeSetup else null,
            onOpenEnrollment = if (state.settings.configured) rootViewModel::openEnrollment else null,
        )

        else -> KioskScreen(
            onOpenSetup = rootViewModel::openSetup,
            onOpenEnrollment = rootViewModel::openEnrollment,
        )
    }
}

@Composable
private fun BootScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "SchoolCheck Kiosk",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}
