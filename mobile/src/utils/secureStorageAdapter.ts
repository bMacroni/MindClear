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
      if (!check) console.error(`[SecureStorageAdapter] Failed to write key: ${key}`);
    } catch (error) {
      console.error('SecureStorageAdapter.setItem error:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await EncryptedStorage.removeItem(key);
    } catch (error) {
      console.error('SecureStorageAdapter.removeItem error:', error);
    }
  },
};

export default SecureStorageAdapter;
