package com.jarvis.fold4.memory

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [MemoryEntity::class, PrefEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class MemoryDatabase : RoomDatabase() {
    abstract fun memoryDao(): MemoryDao

    companion object {
        fun build(context: Context): MemoryDatabase =
            Room.databaseBuilder(context, MemoryDatabase::class.java, "jarvis.db")
                .fallbackToDestructiveMigration()
                .build()
    }
}
