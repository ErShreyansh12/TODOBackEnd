const express = require('express');
const authRoutes = require('./auth.routes');
const staffRoutes = require('./staff.routes');
const notesRoutes = require('./notes.routes');
const taskRoutes = require('./task.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/staff', staffRoutes);
router.use('/notes', notesRoutes);
router.use('/tasks', taskRoutes);

module.exports = router;
