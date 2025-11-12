import {Platform, Alert} from 'react-native';
import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import EncryptedStorage from 'react-native-encrypted-storage';
import {mySchema} from './schema';
import {models} from './models';
import migrations from './migrations/schemaMigrations';
import 'react-native-get-random-values';

const DB_ENCRYPTION_KEY = 'mindclear_db_encryption_key';

let database: Database;
let initializingPromise: Promise<Database> | null = null;

const getPassphrase = async (): Promise<string> => {
  try {
    let passphrase = await EncryptedStorage.getItem(DB_ENCRYPTION_KEY);

    if (!passphrase) {
      // Generate a cryptographically secure random key
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      passphrase = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
      await EncryptedStorage.setItem(DB_ENCRYPTION_KEY, passphrase);
    }    return passphrase;
  } catch (error) {
    console.error('Failed to get or create DB passphrase', error);
    throw new Error('Failed to initialize secure database passphrase. Cannot proceed with database initialization.');
  }};

/**
 * Initializes the WatermelonDB database.
 * This function is idempotent and can be called multiple times.
 * @throws {Error} Throws an error if database initialization fails.
 * @returns {Promise<Database>} A promise that resolves with the database instance.
 */
export const initializeDatabase = async (): Promise<Database> => {
  if (database) {
    return database;
  }

  if (initializingPromise) {
    return await initializingPromise;
  }

  initializingPromise = (async () => {
    try {
      const passphrase = await getPassphrase();

      const adapter = new SQLiteAdapter({
        schema: mySchema,
        migrations,
        // jsi: true, // commented out to disable JSI and avoid native build issues
        onSetUpError: error => {
          console.error('SQLiteAdapter setup error:', error);
          // Forward the error to the outer catch block.
          throw error;
        },
        ...(Platform.OS === 'android' && {
          dbName: 'MindClearDB',
          passphrase,
        }),
      });

      const db = new Database({
        adapter,
        modelClasses: models,
      });
      
      database = db;
      return database;
    } catch (error) {
      console.error("Database initialization failed:", error);
      Alert.alert(
        'Database Initialization Failed',
        'An error occurred while setting up the local database. Please try restarting the app.',
        [{ text: 'OK' }],
        { cancelable: false }
      );
      throw error; // Rethrow to allow caller to handle
    } finally {
      initializingPromise = null;
    }
  })();

  return await initializingPromise;
};

export const getDatabase = () => {
  if (!database) {
    throw new Error('Database has not been initialized. Call initializeDatabase() first.');
  }
  return database;
}
