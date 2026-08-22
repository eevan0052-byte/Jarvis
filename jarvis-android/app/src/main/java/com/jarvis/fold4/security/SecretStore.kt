package com.jarvis.fold4.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * SecretStore — provider API keys encrypted at rest with AES-256-GCM.
 * The key material lives in the Android Keystore (hardware-backed where the
 * device supports it) and never leaves it. Nothing is hard-coded; nothing is
 * logged; ciphertext lives in private app storage only.
 */
class SecretStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("jarvis.secrets", Context.MODE_PRIVATE)

    private val keystore: KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    init {
        if (!keystore.containsAlias(KEY_ALIAS)) {
            val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
            gen.init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            gen.generateKey()
        }
    }

    fun hasKey(providerId: String): Boolean = prefs.contains("key.$providerId")

    /** Store a provider API key (encrypted). Returns true on success. */
    fun putKey(providerId: String, apiKey: String): Boolean = try {
        prefs.edit().putString("key.$providerId", encrypt(apiKey)).apply()
        true
    } catch (e: Exception) {
        false
    }

    fun getKey(providerId: String): String? = try {
        prefs.getString("key.$providerId", null)?.let { decrypt(it) }
    } catch (e: Exception) {
        null
    }

    fun removeKey(providerId: String) {
        prefs.edit().remove("key.$providerId").remove("cfg.$providerId").apply()
    }

    /** Non-secret provider config (endpoint + model name). */
    fun providerConfig(providerId: String): Map<String, String> {
        val raw = prefs.getString("cfg.$providerId", null) ?: return emptyMap()
        return try {
            JSON_parse(raw)
        } catch (e: Exception) {
            emptyMap()
        }
    }

    fun putProviderConfig(providerId: String, baseUrl: String?, model: String?) {
        val map = mutableMapOf<String, String>()
        if (!baseUrl.isNullOrBlank()) map["baseUrl"] = baseUrl
        if (!model.isNullOrBlank()) map["model"] = model
        prefs.edit().putString("cfg.$providerId", JSON_stringify(map)).apply()
    }

    fun destroyAll() {
        val edit = prefs.edit()
        prefs.all.keys.filter { it.startsWith("key.") || it.startsWith("cfg.") }.forEach { edit.remove(it) }
        edit.apply()
    }

    /* ── AES-256-GCM helpers ────────────────────────────────────────────── */

    private fun secretKey(): SecretKey = (keystore.getKey(KEY_ALIAS, null) as SecretKey)

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        val iv = cipher.iv
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
    }

    private fun decrypt(payload: String): String {
        val parts = payload.split(":")
        require(parts.size == 2) { "corrupt ciphertext" }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val ct = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(ct), Charsets.UTF_8)
    }

    private fun JSON_stringify(map: Map<String, String>): String =
        map.entries.joinToString(prefix = "{", postfix = "}") { (k, v) -> "\"${k.replace("\"", "\\\"")}\":\"${v.replace("\"", "\\\"")}\"" }

    private fun JSON_parse(raw: String): Map<String, String> {
        val out = mutableMapOf<String, String>()
        Regex("\"([^\"]+)\":\"([^\"]*)\"").findAll(raw).forEach { out[it.groupValues[1]] = it.groupValues[2] }
        return out
    }

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "jarvis.provider.masterkey"
        private const val TRANSFORM = "AES/GCM/NoPadding"
    }
}
