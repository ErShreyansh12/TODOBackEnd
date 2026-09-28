const taskService = require('../services/task.service');
const { sendSuccess } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const { TASK_UPLOAD_URL_PREFIX } = require('../config/uploads');

async function createTask(req, res, next) {
  try {
    const attachmentUrl = req.file ? `${TASK_UPLOAD_URL_PREFIX}/${req.file.filename}` : null;
    const task = await taskService.createTask({ adminId: req.user.id, data: req.body, attachmentUrl });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Task created successfully.',
      data: { task },
    });
  } catch (err) {
    return next(err);
  }
}

async function getAdminTasks(req, res, next) {
  try {
    const { search, status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const { tasks, pagination } = await taskService.getTasksForAdmin({ search, status, page, limit, skip });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Tasks fetched successfully.',
      data: tasks,
      pagination,
    });
  } catch (err) {
    return next(err);
  }
}

async function updateTaskStatus(req, res, next) {
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    const task = await taskService.updateTaskStatus({
      taskId,
      status,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Task status updated successfully.',
      data: { task },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const { taskId } = req.params;
    const attachmentUrl = req.file ? `${TASK_UPLOAD_URL_PREFIX}/${req.file.filename}` : null;
    const task = await taskService.updateTask({ taskId, data: req.body, attachmentUrl });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Task updated successfully.',
      data: { task },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    const { taskId } = req.params;
    const task = await taskService.deleteTask(taskId);

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Task deleted successfully.',
      data: { task },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createTask, getAdminTasks, updateTask, updateTaskStatus, deleteTask };
