import {schemaMigrations, addColumns} from '@nozbe/watermelondb/Schema/migrations';

/**
 * Migration 3→4: Add location column to tasks table
 * 
 * This migration adds the optional 'location' field to the tasks table
 * to support travel preference filtering in Momentum Mode.
 */
export default schemaMigrations({
  migrations: [
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'tasks',
          columns: [
            {name: 'location', type: 'string', isOptional: true},
          ],
        }),
      ],
    },
  ],
});

