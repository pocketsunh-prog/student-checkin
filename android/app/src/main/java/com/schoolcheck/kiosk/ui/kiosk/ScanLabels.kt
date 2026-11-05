package com.schoolcheck.kiosk.ui.kiosk

import androidx.compose.ui.graphics.Color
import com.schoolcheck.kiosk.ui.theme.KioskAmber
import com.schoolcheck.kiosk.ui.theme.KioskBlue
import com.schoolcheck.kiosk.ui.theme.KioskGreen

internal fun actionLabel(action: String?): String = when (action) {
    "CHECK_IN" -> "Checked in"
    "CHECK_OUT" -> "Checked out"
    "ALREADY_CHECKED_IN" -> "Already checked in"
    "ALREADY_CHECKED_OUT" -> "Already checked out"
    else -> "Scan complete"
}

internal fun actionColor(action: String?): Color = when (action) {
    "CHECK_IN" -> KioskGreen
    "CHECK_OUT" -> KioskBlue
    "ALREADY_CHECKED_IN", "ALREADY_CHECKED_OUT" -> KioskAmber
    else -> KioskGreen
}

internal fun statusText(status: String?, lateMinutes: Int?): String? = when (status) {
    "LATE" -> "Late by ${lateMinutes ?: 0} min"
    "PRESENT" -> "On time"
    "ABSENT" -> "Absent"
    else -> null
}
