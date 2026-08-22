package com.jarvis.fold4.memory

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Adaptive personal memory — categories: fact, preference, reminder, routine,
 * object, device, command, mission, note, observation (usage stats).
 * Everything viewable/editable/deletable via the Memory Center.
 */
@Entity(tableName = "memory")
data class MemoryEntity(
    @PrimaryKey val id: String,
    val category: String,
    val title: String,
    val body: String = "",
    val tags: String = "",            // comma-separated
    val isPrivate: Boolean = false,
    val pinned: Boolean = false,
    val dataJson: String? = null,     // structured extras (dueAt, rule json…)
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
)

/** User preferences — single row store (simpler than DataStore, no binary dep). */
@Entity(tableName = "prefs")
data class PrefEntity(
    @PrimaryKey val key: String,
    val value: String,
)
