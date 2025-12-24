import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
    createRoutine,
    getRoutines,
    getRoutineById,
    updateRoutine,
    deleteRoutine,
    logCompletion,
    removeCompletion,
    undoCompletion
} from '../controllers/routinesController.js';

const router = express.Router();

// Middleware to ensure authentication for all routine routes
router.use(requireAuth);

// Base CRUD
router.post('/', createRoutine);
router.get('/', getRoutines);
router.get('/:id', getRoutineById);
router.put('/:id', updateRoutine);
router.delete('/:id', deleteRoutine);

// Completions
router.post('/:id/complete', logCompletion);
router.post('/:id/undo', undoCompletion);
router.delete('/:id/completions/:completionId', removeCompletion);

export default router;
