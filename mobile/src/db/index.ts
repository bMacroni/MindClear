import {Platform} from 'react-native';
import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import EncryptedStorage from 'react-native-encrypted-storage';
import {mySchema} from './schema';
import {models} from './models';
import 'react-native-get-random-values';

const DB_ENCRYPTION_KEY = 'mindclear_db_encryption_key';

let database: Database;

const getPassphrase = async (): Promise<string> => {
  try {
    let passphrase = await EncryptedStorage.getItem(DB_ENCRYPTION_KEY);

    if (!passphrase) {
      // In a real app, you would use a more robust key generation method
      passphrase = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await EncryptedStorage.setItem(DB_ENCRYPTION_KEY, passphrase);
    }
    return passphrase;
  } catch (error) {
    console.error('Failed to get or create DB passphrase', error);
    // Fallback for safety, but this indicates a serious issue.
    return 'fallback_insecure_key';
  }
};

export const initializeDatabase = async (): Promise<Database> => {
  if (database) {
    return database;
  }

  const passphrase = await getPassphrase();

  const adapter = new SQLiteAdapter({
    schema: mySchema,
    jsi: true,
    onSetUpError: error => {
      console.error('SQLiteAdapter setup error:', error);
    },
    ...(Platform.OS === 'android' && {
      dbName: 'MindClearDB',
      passphrase,
    }),
  });

  database = new Database({
    adapter,
    modelClasses: models,
  });

  return database;
};

export const getDatabase = () => {
  if (!database) {
    throw new Error('Database has not been initialized. Call initializeDatabase() first.');
  }
  return database;
}
