package com.jarvis.fold4.memory

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface MemoryDao {

    @Query("SELECT * FROM memory ORDER BY pinned DESC, updatedAt DESC")
    fun all(): Flow<List<MemoryEntity>>

    @Query("SELECT * FROM memory WHERE category = :cat ORDER BY pinned DESC, updatedAt DESC")
    fun byCategory(cat: String): Flow<List<MemoryEntity>>

    @Query("SELECT * FROM memory WHERE category = :cat")
    suspend fun byCategoryOnce(cat: String): List<MemoryEntity>

    @Query("SELECT * FROM memory WHERE id = :id")
    suspend fun get(id: String): MemoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(e: MemoryEntity)

    @Update
    suspend fun update(e: MemoryEntity)

    @Query("DELETE FROM memory WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM memory WHERE category = :cat")
    suspend fun deleteCategory(cat: String)

    @Query("DELETE FROM memory")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM memory")
    suspend fun count(): Int

    /** Keyword search — LIKE across title/body/tags (case-insensitive). */
    @Query("SELECT * FROM memory WHERE lower(title) LIKE '%' || lower(:q) || '%' OR lower(body) LIKE '%' || lower(:q) || '%' OR lower(tags) LIKE '%' || lower(:q) || '%' ORDER BY updatedAt DESC LIMIT :limit")
    suspend fun search(q: String, limit: Int): List<MemoryEntity>

    /* ── prefs ───────────────────────────────────────────────────────────── */
    @Query("SELECT value FROM prefs WHERE `key` = :key")
    suspend fun pref(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putPref(e: PrefEntity)

    @Query("DELETE FROM prefs WHERE `key` = :key")
    suspend fun deletePref(key: String)
}
