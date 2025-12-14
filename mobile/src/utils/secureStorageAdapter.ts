import EncryptedStorage from 'react-native-encrypted-storage';

const SecureStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await EncryptedStorage.getItem(key);
      return value;
    } catch (error) {
      console.error('SecureStorageAdapter.getItem error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await EncryptedStorage.setItem(key, value);
      // Double check write
      const check = await EncryptedStorage.getItem(key);
      if (check !== value) {
        const error = new Error(`Failed to verify write for key: ${key}`);
        console.error('[SecureStorageAdapter] setItem verification failed:', error);
        throw error;
      }
    } catch (error) {
      console.error('SecureStorageAdapter.setItem error:', error);
      throw error;
    }
  },  removeItem: async (key: string): Promise<void> => {
    try {
      await EncryptedStorage.removeItem(key);
    } catch (error) {
      console.error('SecureStorageAdapter.removeItem error:', error);
      throw error;
    }
  },};

export default SecureStorageAdapter;
