# WatermelonDB Integration Tests

This document describes the comprehensive test suite for the WatermelonDB migration in Mind Clear.

## Test Files Overview

### 1. `watermelondb-integration.test.ts`
**Purpose**: End-to-end integration tests covering the complete WatermelonDB workflow.

**Test Categories**:
- **Task Operations**: Create, update, delete tasks with sync
- **Goal Operations**: Create goals with nested milestones and steps
- **Sync Operations**: Push/pull data between local and server
- **Conflict Resolution**: Handle 409 conflicts gracefully
- **Milestone Sync**: Sync milestone and step operations
- **Error Handling**: Network errors, JSON parse errors, malformed data

**Key Test Scenarios**:
```typescript
// Example: Create task offline, sync online
test('Create task offline, sync online', async () => {
  const task = await taskRepository.createTask({
    title: 'Test Task',
    userId: 'test-user-id',
  });
  
  expect(task.status).toBe('pending_create');
  
  // Mock successful API response
  (enhancedAPI.createTask as jest.Mock).mockResolvedValue({
    id: task.id,
    title: 'Test Task',
    updated_at: new Date().toISOString(),
  });
  
  // Trigger sync
  await syncService.sync();
  
  // Verify task is synced
  const updatedTask = await taskRepository.getTaskById(task.id);
  expect(updatedTask?.status).toBe('synced');
});
```

### 2. `repository-unit.test.ts`
**Purpose**: Unit tests for repository methods and data access patterns.

**Test Categories**:
- **TaskRepository**: CRUD operations, status management, filtering
- **GoalRepository**: Goal operations, milestone management, step operations
- **Complex Queries**: Advanced filtering and relationship queries
- **Status Management**: Pending states and transitions

**Key Test Scenarios**:
```typescript
// Example: Test status transitions
test('updateTask changes status to pending_update', async () => {
  const task = await taskRepository.createTask({
    title: 'Original Task',
    userId: 'test-user',
  });

  await taskRepository.updateTask(task.id, {
    title: 'Updated Task',
  });

  const updatedTask = await taskRepository.getTaskById(task.id);
  expect(updatedTask?.status).toBe('pending_update');
  expect(updatedTask?.title).toBe('Updated Task');
});
```

### 3. `sync-service.test.ts`
**Purpose**: Focused tests for the SyncService push/pull operations.

**Test Categories**:
- **Push Data**: Local to server synchronization
- **Pull Data**: Server to local synchronization
- **Conflict Resolution**: 409 conflict handling
- **Error Handling**: Network errors, malformed data
- **Silent Sync**: Background sync without notifications

**Key Test Scenarios**:
```typescript
// Example: Test conflict resolution
test('handles 409 conflict responses for tasks', async () => {
  const task = await taskRepository.createTask({
    title: 'Conflicting Task',
    userId: 'test-user',
  });

  const conflictError = {
    response: {
      status: 409,
      data: {
        server_record: {
          id: task.id,
          title: 'Server Version',
          updated_at: new Date().toISOString(),
        },
      },
    },
  };

  (enhancedAPI.createTask as jest.Mock).mockRejectedValue(conflictError);
  await syncService.sync();

  const resolvedTask = await taskRepository.getTaskById(task.id);
  expect(resolvedTask?.title).toBe('Server Version');
  expect(resolvedTask?.status).toBe('synced');
});
```

## Test Setup and Configuration

### Mock Strategy
The tests use comprehensive mocking to isolate the WatermelonDB logic:

- **Database**: Mocked WatermelonDB instance with realistic behavior
- **API Services**: Mocked enhancedAPI with configurable responses
- **External Dependencies**: AsyncStorage, NetInfo, Navigation, etc.
- **React Native Components**: Mocked UI components and services

### Test Data Management
Each test:
1. Clears the database before running
2. Creates test data as needed
3. Verifies expected outcomes
4. Cleans up after completion

### Error Simulation
Tests simulate various error conditions:
- Network failures
- JSON parse errors
- Conflict responses (409)
- Malformed data from server

## Running the Tests

### Individual Test Files
```bash
# Run integration tests
npx jest src/__tests__/watermelondb-integration.test.ts --verbose

# Run repository unit tests
npx jest src/__tests__/repository-unit.test.ts --verbose

# Run sync service tests
npx jest src/__tests__/sync-service.test.ts --verbose
```

### All WatermelonDB Tests
```bash
# Use the test runner script
node scripts/run-watermelondb-tests.js
```

### Watch Mode
```bash
# Run tests in watch mode for development
npx jest src/__tests__/ --watch
```

## Test Coverage

### Core Functionality Covered
- ✅ Task CRUD operations with sync
- ✅ Goal CRUD operations with sync
- ✅ Milestone and step management
- ✅ Offline-first data flow
- ✅ Conflict resolution
- ✅ Error handling and recovery
- ✅ Status management (pending_create → pending_update → synced → pending_delete)
- ✅ Incremental sync with deletions
- ✅ Silent background sync

### Edge Cases Covered
- ✅ Network failures during sync
- ✅ JSON parse errors (empty responses)
- ✅ Malformed date strings
- ✅ 409 conflict responses
- ✅ Nested data creation (goals with milestones and steps)
- ✅ Complex query filtering
- ✅ Status transitions

### Performance Considerations
- ✅ Batch operations for multiple records
- ✅ Efficient query patterns
- ✅ Minimal database writes
- ✅ Observable subscriptions

## Test Results Interpretation

### Success Criteria
- All tests pass without errors
- No memory leaks or hanging promises
- Proper cleanup after each test
- Realistic mock behavior

### Common Issues and Solutions

**Issue**: Tests failing due to async operations
**Solution**: Ensure proper `await` usage and mock resolution

**Issue**: Database state persisting between tests
**Solution**: Clear database in `beforeEach` hook

**Issue**: Mock not returning expected data
**Solution**: Verify mock configuration and return values

## Integration with CI/CD

### Pre-commit Hooks
```bash
# Add to package.json scripts
"test:watermelondb": "jest src/__tests__/watermelondb-integration.test.ts src/__tests__/repository-unit.test.ts src/__tests__/sync-service.test.ts"
```

### GitHub Actions
```yaml
- name: Run WatermelonDB Tests
  run: |
    cd mobile
    npm run test:watermelondb
```

## Maintenance Guidelines

### Adding New Tests
1. Follow the existing pattern and structure
2. Use descriptive test names
3. Include both positive and negative test cases
4. Mock external dependencies appropriately
5. Clean up test data after completion

### Updating Tests
1. Update mocks when API changes
2. Adjust test data when schema changes
3. Verify test coverage for new features
4. Update documentation when adding new test categories

### Debugging Failed Tests
1. Check mock configurations
2. Verify async/await usage
3. Ensure proper test isolation
4. Check for timing issues
5. Review error messages and stack traces

## Future Enhancements

### Planned Test Additions
- [ ] Performance benchmarks
- [ ] Memory usage tests
- [ ] Large dataset handling
- [ ] Concurrent sync operations
- [ ] Offline queue management
- [ ] Data migration tests

### Test Automation
- [ ] Automated test data generation
- [ ] Visual regression testing
- [ ] Load testing for sync operations
- [ ] Cross-platform compatibility tests

This comprehensive test suite ensures the WatermelonDB migration is robust, reliable, and ready for production use.
