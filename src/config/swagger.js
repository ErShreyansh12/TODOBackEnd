const swaggerJsdoc = require('swagger-jsdoc');
const env = require('./env');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'TODO & Staff Task Management System API',
      version: '1.0.0',
      description: 'REST API for the TODO & Staff Task Management System.',
    },
    servers: [
      {
        url: `http://localhost:${env.port}/api/v1`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Request successful.' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Invalid email or password.' },
            errorCode: { type: 'string', example: 'INVALID_CREDENTIALS' },
          },
        },
        StaffRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '6aa4036fac73e628c27d3599' },
            staffId: { type: 'string', example: 'EMP-001' },
            firstName: { type: 'string', example: 'Priya' },
            lastName: { type: 'string', example: 'Nair' },
            email: { type: 'string', nullable: true, example: 'priya.nair@example.com' },
            phone: { type: 'string', nullable: true, example: '+1 415 555 0136' },
            status: { type: 'string', example: 'active' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          },
        },
        NoteRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '6aae1234ab56cd78ef901234' },
            title: { type: 'string', example: 'Client Onboarding Checklist' },
            contentHtml: { type: 'string', example: '<p>Verify credentials before handoff.</p>' },
            pinned: { type: 'boolean', example: false },
            archived: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          },
        },
        CreateTaskRequest: {
          type: 'object',
          required: ['title', 'assigneeType', 'assigneeId', 'timeline', 'time', 'priority'],
          properties: {
            title: { type: 'string', example: 'Daily sales report' },
            description: { type: 'string', example: 'Compile and share the sales numbers.' },
            broker: { type: 'string', example: 'ABC Brokers' },
            assigneeType: { type: 'string', enum: ['admin', 'staff'], example: 'staff' },
            assigneeId: { type: 'string', example: '6aa4036fac73e628c27d3554', description: "The staff member's or admin's id" },
            timeline: {
              type: 'string',
              enum: ['daily', 'saturday', '1st', '16th', 'monthly', 'custom'],
              example: 'daily',
            },
            time: { type: 'string', example: '10:00', description: '24-hour HH:mm, in Asia/Kolkata' },
            customDates: {
              type: 'array',
              items: { type: 'string', example: '2026-10-05' },
              description: 'Required only when timeline is custom. Dates must be in the future.',
            },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], example: 'high' },
            status: { type: 'string', enum: ['todo', 'in_progress'], default: 'todo' },
          },
        },
        TaskRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '6aae1234ab56cd78ef901234' },
            seriesId: { type: 'string', example: '6aae1234ab56cd78ef901111' },
            title: { type: 'string', example: 'Daily sales report' },
            description: { type: 'string', nullable: true },
            attachmentUrl: { type: 'string', nullable: true, example: '/uploads/tasks/0b1c...e9.pdf' },
            broker: { type: 'string', nullable: true },
            createdBy: { type: 'string', example: '6aa4036fac73e628c27d3554' },
            assignee: {
              type: 'object',
              properties: {
                type: { type: 'string', example: 'staff' },
                id: { type: 'string' },
                name: { type: 'string', example: 'Priya Nair' },
              },
            },
            priority: { type: 'string', example: 'high' },
            status: { type: 'string', example: 'todo', description: 'Stored status: todo, in_progress or completed' },
            displayStatus: {
              type: 'string',
              example: 'delayed',
              description: 'Computed status: same as status, but becomes delayed once due date has passed and it is not completed',
            },
            timeline: { type: 'string', example: 'daily' },
            customDates: {
              type: 'array',
              nullable: true,
              items: { type: 'object', properties: { date: { type: 'string', example: '2026-10-05' } } },
            },
            dueDate: { type: 'string', example: '2026-09-29', description: 'Deadline date in Asia/Kolkata' },
            time: { type: 'string', example: '10:00', description: 'Deadline time in Asia/Kolkata' },
            dueAt: { type: 'string', format: 'date-time', description: 'Deadline as a UTC timestamp' },
            completionAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: null,
              description: 'When this task was marked completed; null if it is not currently completed',
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 42 },
            totalPages: { type: 'integer', example: 3 },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
