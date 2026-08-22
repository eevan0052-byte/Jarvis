package com.jarvis.fold4.biometrics

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Biometric template storage — AES-256-GCM with a Keystore key.
 * Voice/face templates are personal data: they are encrypted at rest, never
 * logged, never transmitted, and deleted on user request.
 */
class BiometricCrypto(context: Context) {

    private val prefs = context.getSharedPreferences("jarvis.bio", Context.MODE_PRIVATE)
    private val keystore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    init {
        if (!keystore.containsAlias(ALIAS)) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(
                KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            generator.generateKey()
        }
    }

    fun save(namespace: String, plainJson: String) {
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val ct = cipher.doFinal(plainJson.toByteArray(Charsets.UTF_8))
        val payload = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(ct, Base64.NO_WRAP)
        prefs.edit().putString("bio.$namespace", payload).apply()
    }

    fun load(namespace: String): String? = try {
        val payload = prefs.getString("bio.$namespace", null) ?: return null
        val (ivB64, ctB64) = payload.split(":")
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)))
        String(cipher.doFinal(Base64.decode(ctB64, Base64.NO_WRAP)), Charsets.UTF_8)
    } catch (e: Exception) {
        null
    }

    fun delete(namespace: String) {
        prefs.edit().remove("bio.$namespace").apply()
    }

    fun wipeAll() {
        val edit = prefs.edit()
        prefs.all.keys.filter { it.startsWith("bio.") }.forEach { edit.remove(it) }
        edit.apply()
    }

    private fun key(): SecretKey = keystore.getKey(ALIAS, null) as SecretKey

    companion object {
        private const val ALIAS = "jarvis.bio.masterkey"
        private const val TRANSFORM = "AES/GCM/NoPadding"
    }
}
