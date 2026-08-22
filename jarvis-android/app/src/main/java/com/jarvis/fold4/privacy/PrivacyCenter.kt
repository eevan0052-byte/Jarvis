package com.jarvis.fold4.privacy

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.jarvis.fold4.JarvisApp
import com.jarvis.fold4.biometrics.FaceProfiles
import com.jarvis.fold4.biometrics.SpeakerProfiles

/**
 * Privacy Center model — what JARVIS can access, what it has accessed,
 * and how to revoke each capability. Every claim here maps to a real
 * permission or a real stored dataset.
 */
class PrivacyCenter(private val context: Context) {

    data class Capability(
        val id: String,
        val label: String,
        val icon: String,
        val description: String,
        val permission: String? = null,
        val state: State,
        val biometric: Boolean = false,
        val deleteAction: (suspend () -> Unit)? = null,
    ) {
        enum class State { GRANTED, DENIED, NOT_ASKED, UNAVAILABLE }
    }

    fun capabilities(): List<Capability> = listOf(
        Capability(
            "microphone", "Microphone", "🎙",
            "Used for voice commands, the voice-activity meter and optional voice enrollment. Audio is processed live and never recorded to storage.",
            Manifest.permission.RECORD_AUDIO, permState(Manifest.permission.RECORD_AUDIO),
        ),
        Capability(
            "camera", "Camera", "◎",
            "Used only while Vision Mode is open, with a visible red indicator. Frames are analyzed on-device by ML Kit and never uploaded.",
            Manifest.permission.CAMERA, permState(Manifest.permission.CAMERA),
        ),
        Capability(
            "notifications", "Notifications", "◈",
            "Used for reminders and predictions you authorize.",
            Manifest.permission.POST_NOTIFICATIONS, permState(Manifest.permission.POST_NOTIFICATIONS),
        ),
        Capability(
            "location", "Location", "⌖",
            "Optional, for weather and arrival routines. You can use a manual city instead.",
            Manifest.permission.ACCESS_COARSE_LOCATION, permState(Manifest.permission.ACCESS_COARSE_LOCATION),
        ),
        Capability(
            "calendar", "Calendar (read)", "▤",
            "Optional, for briefings and mission planning. Never written.",
            Manifest.permission.READ_CALENDAR, permState(Manifest.permission.READ_CALENDAR),
        ),
        Capability(
            "contacts", "Contacts (read)", "⌂",
            "Optional, for emergency info mode. Never synced.",
            Manifest.permission.READ_CONTACTS, permState(Manifest.permission.READ_CONTACTS),
        ),
        Capability(
            "speaker", "Voice biometrics", "∿",
            "Acoustic voiceprint (experimental, not security-grade). Encrypted at rest, processed locally, deleted on request.",
            biometric = true,
            state = Capability.State.GRANTED,
            deleteAction = { SpeakerProfiles().wipe() },
        ),
        Capability(
            "face", "Face biometrics", "◉",
            "Landmark templates for personalization only. Encrypted at rest, processed locally, deleted on request.",
            biometric = true,
            state = Capability.State.GRANTED,
            deleteAction = { FaceProfiles().wipe() },
        ),
        Capability(
            "memory", "Personal memory", "◈",
            "Facts, preferences, reminders and routines you ask me to keep. Viewable, editable and deletable in the Memory Center.",
            state = Capability.State.GRANTED,
            deleteAction = { JarvisApp.instance.memory.wipe() },
        ),
    )

    private fun permState(perm: String): Capability.State {
        return when {
            ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED -> Capability.State.GRANTED
            ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_DENIED -> Capability.State.DENIED
            else -> Capability.State.NOT_ASKED
        }
    }
}
