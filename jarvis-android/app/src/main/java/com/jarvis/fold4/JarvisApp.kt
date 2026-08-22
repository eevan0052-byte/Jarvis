package com.jarvis.fold4

import android.app.Application
import com.jarvis.fold4.ai.ProviderRegistry
import com.jarvis.fold4.biometrics.BiometricCrypto
import com.jarvis.fold4.memory.MemoryDatabase
import com.jarvis.fold4.memory.MemoryRepository
import com.jarvis.fold4.privacy.AuditLogger
import com.jarvis.fold4.security.SecretStore

/**
 * Application root — service composition (no DI framework needed at this scale).
 * Every subsystem is constructed here with strong module boundaries:
 * ui → viewmodels → ai/voice/vision/biometrics/memory/context/automation/device
 *              → security/privacy (leaf services)
 */
class JarvisApp : Application() {

    lateinit var memory: MemoryRepository
        private set
    lateinit var secretStore: SecretStore
        private set
    lateinit var audit: AuditLogger
        private set
    lateinit var providers: ProviderRegistry
        private set
    lateinit var bioCrypto: BiometricCrypto
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        // ── data layer ─────────────────────────────────────────────────────
        val db = MemoryDatabase.build(this)
        memory = MemoryRepository(db)
        audit = AuditLogger(db)
        bioCrypto = BiometricCrypto(this)

        // ── security ───────────────────────────────────────────────────────
        // Provider API keys are encrypted at rest with an Android Keystore
        // AES-256-GCM key. No hard-coded secrets anywhere in the app.
        secretStore = SecretStore(this)

        // ── AI ─────────────────────────────────────────────────────────────
        providers = ProviderRegistry(secretStore)
        audit.record("system", "application started")
    }

    companion object {
        lateinit var instance: JarvisApp
            private set
    }
}
