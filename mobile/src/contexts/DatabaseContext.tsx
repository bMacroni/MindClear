import React, {createContext, useContext, ReactNode} from 'react';
import {Database} from '@nozbe/watermelondb';

const DatabaseContext = createContext<Database | null>(null);

export const DatabaseProvider = ({
  database,
  children,
}: {
  database: Database;
  children: ReactNode;
}) => {
  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => {
  const database = useContext(DatabaseContext);
  if (!database) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return database;
};
